import json
import logging
import hmac
import hashlib
import requests
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class MercadoPagoWebhook(http.Controller):
    """
    Webhook para recibir notificaciones de Mercado Pago.

    Endpoints:
    - POST /salon_turnos/webhook/mercadopago - Webhook principal
    - GET /salon_turnos/pago/exito - Página de pago exitoso
    - GET /salon_turnos/pago/error - Página de error en pago
    - GET /salon_turnos/pago/pendiente - Página de pago pendiente
    """

    def _verify_signature(self, x_signature, x_request_id, data_id):
        """
        Verifica la firma del webhook de MP.
        https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
        """
        webhook_secret = request.env['ir.config_parameter'].sudo().get_param(
            'salon_turnos.mp_webhook_secret'
        )

        if not webhook_secret:
            _logger.warning('Webhook secret no configurado, omitiendo verificación')
            return True

        # Parsear x_signature
        # Formato: ts=xxx,v1=xxx
        parts = {}
        for part in x_signature.split(','):
            key, value = part.split('=')
            parts[key] = value

        ts = parts.get('ts')
        v1 = parts.get('v1')

        # Construir string para verificar
        manifest = f'id:{data_id};request-id:{x_request_id};ts:{ts};'

        # Calcular HMAC
        calculated = hmac.new(
            webhook_secret.encode(),
            manifest.encode(),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(calculated, v1)

    @http.route(
        '/salon_turnos/webhook/mercadopago',
        type='http',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def webhook_mercadopago(self, **kwargs):
        """
        Recibe notificaciones de Mercado Pago.

        Tipos de notificación:
        - payment: Pago realizado
        - plan: Suscripción (no usado)
        - subscription: Suscripción (no usado)
        - invoice: Factura (no usado)
        """
        try:
            # MP puede enviar datos como JSON body o query params
            content_type = request.httprequest.content_type or ''

            if 'application/json' in content_type:
                data = json.loads(request.httprequest.data.decode('utf-8'))
            else:
                # Datos vienen como query params
                data = {
                    'type': kwargs.get('type'),
                    'data': {'id': kwargs.get('data.id')},
                    'action': kwargs.get('action'),
                }

            _logger.info(f'Webhook MP recibido: {json.dumps(data)}')

            # Verificar firma si está configurada
            x_signature = request.httprequest.headers.get('x-signature')
            x_request_id = request.httprequest.headers.get('x-request-id')

            if x_signature and x_request_id:
                # MP firma usando el data.id de los query params, no del body
                data_id_for_signature = kwargs.get('data.id') or data.get('data', {}).get('id')
                if not self._verify_signature(x_signature, x_request_id, str(data_id_for_signature)):
                    _logger.warning(f'Firma de webhook inválida para data_id: {data_id_for_signature}')
                    return Response(
                        json.dumps({'status': 'error', 'message': 'Invalid signature'}),
                        content_type='application/json',
                        status=401
                    )

            # Procesar según tipo
            notification_type = data.get('type')
            action = data.get('action')

            if notification_type == 'payment':
                result = self._process_payment_notification(data)
            elif notification_type == 'merchant_order':
                result = self._process_merchant_order(data)
            else:
                _logger.info(f'Tipo de notificación no manejado: {notification_type}')
                result = {'status': 'ok', 'message': 'Notification type not handled'}

            return Response(
                json.dumps(result),
                content_type='application/json',
                status=200
            )

        except Exception as e:
            _logger.error(f'Error procesando webhook MP: {e}')
            return Response(
                json.dumps({'status': 'error', 'message': str(e)}),
                content_type='application/json',
                status=500
            )

    def _process_payment_notification(self, data):
        """Procesa notificación de pago"""
        payment_id = data.get('data', {}).get('id')

        if not payment_id:
            return {'status': 'error', 'message': 'No payment ID'}

        # Obtener detalles del pago desde MP
        mp_access_token = request.env['ir.config_parameter'].sudo().get_param(
            'salon_turnos.mp_access_token'
        )

        if not mp_access_token:
            _logger.error('Access token de MP no configurado')
            return {'status': 'error', 'message': 'MP not configured'}

        try:
            response = requests.get(
                f'https://api.mercadopago.com/v1/payments/{payment_id}',
                headers={'Authorization': f'Bearer {mp_access_token}'},
                timeout=30,
            )
            response.raise_for_status()
            payment_data = response.json()

            _logger.info(f'Datos del pago: {json.dumps(payment_data)}')

            # Obtener referencia externa (ID del turno)
            external_reference = payment_data.get('external_reference')
            status = payment_data.get('status')

            if not external_reference:
                _logger.warning('Pago sin external_reference')
                return {'status': 'ok', 'message': 'No external reference'}

            # Buscar turno
            turno = request.env['salon.turno'].sudo().browse(int(external_reference))

            if not turno.exists():
                _logger.warning(f'Turno {external_reference} no encontrado')
                return {'status': 'error', 'message': 'Turno not found'}

            # Actualizar según estado del pago
            if status == 'approved':
                turno.write({
                    'sena_pagada': True,
                    'estado': 'confirmado',
                    'mp_payment_id': str(payment_id),
                })
                turno.message_post(
                    body=f'Pago de seña confirmado via Mercado Pago. '
                         f'Payment ID: {payment_id}'
                )
                _logger.info(f'Turno {turno.id} confirmado por pago MP {payment_id}')

                # Notificar a n8n para que procese el resto del flujo
                # (contacto, factura, calendario, email, WhatsApp)
                self._notify_n8n_payment_confirmed(turno, payment_id, payment_data)

            elif status in ['pending', 'in_process']:
                turno.message_post(
                    body=f'Pago pendiente en Mercado Pago. Payment ID: {payment_id}'
                )

            elif status in ['rejected', 'cancelled']:
                turno.message_post(
                    body=f'Pago rechazado/cancelado en Mercado Pago. '
                         f'Payment ID: {payment_id}, Status: {status}'
                )

            return {'status': 'ok', 'message': f'Payment {status}'}

        except requests.exceptions.RequestException as e:
            _logger.error(f'Error consultando pago a MP: {e}')
            return {'status': 'error', 'message': str(e)}

    def _process_merchant_order(self, data):
        """Procesa notificación de orden de comerciante"""
        # Similar a payment pero para órdenes
        _logger.info('Merchant order notification received')
        return {'status': 'ok', 'message': 'Merchant order processed'}

    def _notify_n8n_payment_confirmed(self, turno, payment_id, payment_data):
        """
        Notifica a n8n que el pago fue confirmado.

        n8n se encarga de:
        - Crear contacto (res.partner)
        - Crear factura (account.move)
        - Crear evento calendario
        - Enviar email con PDF
        - Enviar WhatsApp

        Esta llamada es "fire and forget" - si falla, el pago ya está registrado
        en Odoo y se puede reintentar el enriquecimiento después.
        """
        n8n_webhook_url = request.env['ir.config_parameter'].sudo().get_param(
            'salon_turnos.n8n_webhook_url'
        )

        if not n8n_webhook_url:
            _logger.warning('n8n webhook URL no configurada, omitiendo notificación')
            return

        try:
            # Preparar datos del turno para n8n
            turno_data = {
                'event': 'payment_confirmed',
                'turno': {
                    'id': turno.id,
                    'clienta': turno.clienta,
                    'telefono': turno.telefono,
                    'email': turno.email,
                    'servicio': turno.servicio,
                    'servicio_detalle': turno.servicio_detalle,
                    'fecha_hora': turno.fecha_hora.isoformat() if turno.fecha_hora else None,
                    'duracion': turno.duracion,
                    'precio': turno.precio,
                    'sena': turno.sena,
                    'monto_restante': turno.monto_restante,
                },
                'payment': {
                    'mp_payment_id': str(payment_id),
                    'status': payment_data.get('status'),
                    'status_detail': payment_data.get('status_detail'),
                    'payer_email': payment_data.get('payer', {}).get('email'),
                },
            }

            # Llamada async-style (timeout corto, no esperamos respuesta)
            response = requests.post(
                n8n_webhook_url,
                json=turno_data,
                headers={'Content-Type': 'application/json'},
                timeout=5,  # Timeout corto - fire and forget
            )

            if response.ok:
                _logger.info(f'n8n notificado exitosamente para turno {turno.id}')
            else:
                _logger.warning(
                    f'n8n respondió con error: {response.status_code} - {response.text}'
                )

        except requests.exceptions.Timeout:
            _logger.warning(f'Timeout al notificar a n8n para turno {turno.id}')
        except requests.exceptions.RequestException as e:
            _logger.error(f'Error al notificar a n8n: {e}')

    @http.route(
        '/salon_turnos/pago/exito',
        type='http',
        auth='public',
        methods=['GET'],
        csrf=False,
    )
    def pago_exito(self, **kwargs):
        """Página de pago exitoso"""
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Pago Exitoso - Estilos Leraysi</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .card {
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    text-align: center;
                    max-width: 400px;
                }
                .icon { font-size: 64px; margin-bottom: 20px; }
                h1 { color: #22c55e; margin: 0 0 10px; }
                p { color: #666; line-height: 1.6; }
                .details { background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">✅</div>
                <h1>¡Pago Exitoso!</h1>
                <p>Tu seña ha sido procesada correctamente.</p>
                <div class="details">
                    <strong>Tu turno está confirmado</strong><br>
                    Te enviaremos un recordatorio antes de tu cita.
                </div>
                <p style="color: #888; font-size: 14px;">
                    Estilos Leraysi - Salón de Belleza
                </p>
            </div>
        </body>
        </html>
        """
        return Response(html, content_type='text/html')

    @http.route(
        '/salon_turnos/pago/error',
        type='http',
        auth='public',
        methods=['GET'],
        csrf=False,
    )
    def pago_error(self, **kwargs):
        """Página de error en pago"""
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Error en Pago - Estilos Leraysi</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .card {
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    text-align: center;
                    max-width: 400px;
                }
                .icon { font-size: 64px; margin-bottom: 20px; }
                h1 { color: #ef4444; margin: 0 0 10px; }
                p { color: #666; line-height: 1.6; }
                .btn {
                    display: inline-block;
                    background: #667eea;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 8px;
                    text-decoration: none;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">❌</div>
                <h1>Error en el Pago</h1>
                <p>No pudimos procesar tu pago. Por favor, intentá nuevamente o contactanos.</p>
                <p style="color: #888; font-size: 14px;">
                    Estilos Leraysi - Salón de Belleza
                </p>
            </div>
        </body>
        </html>
        """
        return Response(html, content_type='text/html')

    @http.route(
        '/salon_turnos/pago/pendiente',
        type='http',
        auth='public',
        methods=['GET'],
        csrf=False,
    )
    def pago_pendiente(self, **kwargs):
        """Página de pago pendiente"""
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Pago Pendiente - Estilos Leraysi</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .card {
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    text-align: center;
                    max-width: 400px;
                }
                .icon { font-size: 64px; margin-bottom: 20px; }
                h1 { color: #f59e0b; margin: 0 0 10px; }
                p { color: #666; line-height: 1.6; }
                .details { background: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">⏳</div>
                <h1>Pago Pendiente</h1>
                <p>Tu pago está siendo procesado.</p>
                <div class="details">
                    <strong>Te notificaremos cuando se confirme</strong><br>
                    Esto puede tomar unos minutos.
                </div>
                <p style="color: #888; font-size: 14px;">
                    Estilos Leraysi - Salón de Belleza
                </p>
            </div>
        </body>
        </html>
        """
        return Response(html, content_type='text/html')
