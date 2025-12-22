import json
import logging
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class SalonTurnosAPI(http.Controller):
    """
    API REST para integración con el agente AI.

    Endpoints:
    - POST /salon_turnos/api/turno - Crear nuevo turno
    - GET /salon_turnos/api/turno/<id> - Obtener turno por ID
    - GET /salon_turnos/api/turnos - Buscar turnos con filtros
    - PUT /salon_turnos/api/turno/<id>/estado - Actualizar estado
    - GET /salon_turnos/api/disponibilidad - Verificar disponibilidad

    Headers requeridos:
    - X-API-Key: API key configurada en salon_turnos.api_key
    """

    def _check_api_key(self):
        """Verifica la API key en el header"""
        api_key = request.httprequest.headers.get('X-API-Key')
        expected_key = request.env['ir.config_parameter'].sudo().get_param(
            'salon_turnos.api_key'
        )

        if not expected_key:
            _logger.warning('API key no configurada en salon_turnos.api_key')
            return True  # Permitir si no está configurada (desarrollo)

        if api_key != expected_key:
            return False
        return True

    def _json_response(self, data, status=200):
        """Helper para respuestas JSON"""
        return Response(
            json.dumps(data, default=str),
            status=status,
            content_type='application/json',
        )

    @http.route(
        '/salon_turnos/api/turno',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def crear_turno(self, **kwargs):
        """
        Crear nuevo turno.

        Body JSON:
        {
            "clienta": "María García",
            "telefono": "+5491112345678",
            "servicio": "corte",
            "fecha_hora": "2025-01-15T10:00:00",
            "precio": 5000,
            "duracion": 1.0,  // opcional
            "email": "maria@email.com",  // opcional
            "notas": "Primera vez",  // opcional
            "generar_link_pago": true  // opcional, default true
        }

        Response:
        {
            "success": true,
            "turno": { ... datos del turno ... }
        }
        """
        if not self._check_api_key():
            return {'success': False, 'error': 'API key inválida'}

        try:
            data = request.jsonrequest

            turno_model = request.env['salon.turno'].sudo()
            turno = turno_model.api_crear_turno(data)

            return {
                'success': True,
                'turno': turno,
            }

        except Exception as e:
            _logger.error(f'Error al crear turno: {e}')
            return {
                'success': False,
                'error': str(e),
            }

    @http.route(
        '/salon_turnos/api/turno/<int:turno_id>',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def obtener_turno(self, turno_id, **kwargs):
        """
        Obtener turno por ID.

        Response:
        {
            "success": true,
            "turno": { ... datos del turno ... }
        }
        """
        if not self._check_api_key():
            return self._json_response({'success': False, 'error': 'API key inválida'}, 401)

        try:
            turno_model = request.env['salon.turno'].sudo()
            turno = turno_model.api_obtener_turno(turno_id)

            if turno:
                return self._json_response({'success': True, 'turno': turno})
            else:
                return self._json_response({'success': False, 'error': 'Turno no encontrado'}, 404)

        except Exception as e:
            _logger.error(f'Error al obtener turno: {e}')
            return self._json_response({'success': False, 'error': str(e)}, 500)

    @http.route(
        '/salon_turnos/api/turnos',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def buscar_turnos(self, **kwargs):
        """
        Buscar turnos con filtros.

        Query params:
        - clienta: búsqueda parcial por nombre
        - telefono: búsqueda exacta
        - fecha_desde: ISO date (2025-01-01)
        - fecha_hasta: ISO date (2025-01-31)
        - estado: pendiente_pago, confirmado, completado, cancelado
        - servicio: corte, tintura, etc.

        Response:
        {
            "success": true,
            "turnos": [ ... lista de turnos ... ],
            "total": 10
        }
        """
        if not self._check_api_key():
            return self._json_response({'success': False, 'error': 'API key inválida'}, 401)

        try:
            filtros = {}
            if kwargs.get('clienta'):
                filtros['clienta'] = kwargs['clienta']
            if kwargs.get('telefono'):
                filtros['telefono'] = kwargs['telefono']
            if kwargs.get('fecha_desde'):
                filtros['fecha_desde'] = kwargs['fecha_desde']
            if kwargs.get('fecha_hasta'):
                filtros['fecha_hasta'] = kwargs['fecha_hasta']
            if kwargs.get('estado'):
                filtros['estado'] = kwargs['estado']
            if kwargs.get('servicio'):
                filtros['servicio'] = kwargs['servicio']

            turno_model = request.env['salon.turno'].sudo()
            turnos = turno_model.api_buscar_turnos(filtros)

            return self._json_response({
                'success': True,
                'turnos': turnos,
                'total': len(turnos),
            })

        except Exception as e:
            _logger.error(f'Error al buscar turnos: {e}')
            return self._json_response({'success': False, 'error': str(e)}, 500)

    @http.route(
        '/salon_turnos/api/turno/<int:turno_id>/estado',
        type='jsonrpc',
        auth='none',
        methods=['PUT'],
        csrf=False,
    )
    def actualizar_estado(self, turno_id, **kwargs):
        """
        Actualizar estado del turno.

        Body JSON:
        {
            "estado": "confirmado"  // pendiente_pago, confirmado, completado, cancelado
        }

        Response:
        {
            "success": true,
            "turno": { ... datos actualizados ... }
        }
        """
        if not self._check_api_key():
            return {'success': False, 'error': 'API key inválida'}

        try:
            data = request.jsonrequest
            nuevo_estado = data.get('estado')

            if nuevo_estado not in ['pendiente_pago', 'confirmado', 'completado', 'cancelado']:
                return {'success': False, 'error': 'Estado inválido'}

            turno = request.env['salon.turno'].sudo().browse(turno_id)
            if not turno.exists():
                return {'success': False, 'error': 'Turno no encontrado'}

            if nuevo_estado == 'confirmado':
                turno.write({'estado': 'confirmado', 'sena_pagada': True})
            elif nuevo_estado == 'completado':
                turno.action_completar()
            elif nuevo_estado == 'cancelado':
                turno.action_cancelar()
            else:
                turno.write({'estado': nuevo_estado})

            return {
                'success': True,
                'turno': turno._to_dict(),
            }

        except Exception as e:
            _logger.error(f'Error al actualizar estado: {e}')
            return {'success': False, 'error': str(e)}

    @http.route(
        '/salon_turnos/api/disponibilidad',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def verificar_disponibilidad(self, **kwargs):
        """
        Verificar disponibilidad de horarios.

        Query params:
        - fecha: ISO date (2025-01-15)
        - duracion: duración en horas (default 1)

        Response:
        {
            "success": true,
            "fecha": "2025-01-15",
            "turnos_ocupados": [
                {"hora_inicio": "10:00", "hora_fin": "11:00", "servicio": "corte"}
            ],
            "horarios_disponibles": ["09:00", "11:00", "12:00", "14:00", ...]
        }
        """
        if not self._check_api_key():
            return self._json_response({'success': False, 'error': 'API key inválida'}, 401)

        try:
            from datetime import datetime, time, timedelta

            fecha_str = kwargs.get('fecha')
            if not fecha_str:
                return self._json_response({'success': False, 'error': 'Parámetro fecha requerido'}, 400)

            duracion = float(kwargs.get('duracion', 1))

            # Parsear fecha
            fecha = datetime.strptime(fecha_str, '%Y-%m-%d').date()

            # Buscar turnos del día (no cancelados)
            turno_model = request.env['salon.turno'].sudo()
            turnos = turno_model.search([
                ('fecha_hora', '>=', datetime.combine(fecha, time(0, 0))),
                ('fecha_hora', '<', datetime.combine(fecha + timedelta(days=1), time(0, 0))),
                ('estado', '!=', 'cancelado'),
            ])

            turnos_ocupados = []
            for turno in turnos:
                turnos_ocupados.append({
                    'hora_inicio': turno.fecha_hora.strftime('%H:%M'),
                    'hora_fin': turno.fecha_fin.strftime('%H:%M') if turno.fecha_fin else None,
                    'servicio': turno.servicio,
                    'clienta': turno.clienta,
                })

            # Calcular horarios disponibles (9:00 - 19:00)
            horarios_disponibles = []
            hora_apertura = 9
            hora_cierre = 19

            for hora in range(hora_apertura, hora_cierre):
                for minuto in [0, 30]:  # Cada 30 minutos
                    slot_inicio = datetime.combine(fecha, time(hora, minuto))
                    slot_fin = slot_inicio + timedelta(hours=duracion)

                    # Verificar si el slot está libre
                    ocupado = False
                    for turno in turnos:
                        turno_inicio = turno.fecha_hora.replace(tzinfo=None)
                        turno_fin = turno.fecha_fin.replace(tzinfo=None) if turno.fecha_fin else turno_inicio + timedelta(hours=1)

                        # Verificar superposición
                        if slot_inicio < turno_fin and slot_fin > turno_inicio:
                            ocupado = True
                            break

                    if not ocupado and slot_fin.hour <= hora_cierre:
                        horarios_disponibles.append(f'{hora:02d}:{minuto:02d}')

            return self._json_response({
                'success': True,
                'fecha': fecha_str,
                'turnos_ocupados': turnos_ocupados,
                'horarios_disponibles': horarios_disponibles,
            })

        except Exception as e:
            _logger.error(f'Error al verificar disponibilidad: {e}')
            return self._json_response({'success': False, 'error': str(e)}, 500)

    @http.route(
        '/salon_turnos/api/servicios',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def listar_servicios(self, **kwargs):
        """
        Listar servicios disponibles.

        Response:
        {
            "success": true,
            "servicios": [
                {"code": "corte", "name": "Corte"},
                {"code": "tintura", "name": "Tintura"},
                ...
            ]
        }
        """
        servicios = [
            {'code': 'corte', 'name': 'Corte'},
            {'code': 'tintura', 'name': 'Tintura'},
            {'code': 'mechas', 'name': 'Mechas'},
            {'code': 'brushing', 'name': 'Brushing'},
            {'code': 'peinado', 'name': 'Peinado'},
            {'code': 'tratamiento', 'name': 'Tratamiento Capilar'},
            {'code': 'manicura', 'name': 'Manicura'},
            {'code': 'pedicura', 'name': 'Pedicura'},
            {'code': 'depilacion', 'name': 'Depilación'},
            {'code': 'maquillaje', 'name': 'Maquillaje'},
            {'code': 'otro', 'name': 'Otro'},
        ]

        return self._json_response({
            'success': True,
            'servicios': servicios,
        })
