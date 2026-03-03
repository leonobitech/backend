import json
import logging
import requests
import base64
from datetime import timedelta
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class SalonTurno(models.Model):
    _name = 'salon.turno'
    _description = 'Turno de Salón de Belleza'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'fecha_hora desc'

    # Datos de la clienta
    clienta = fields.Char(
        string='Clienta',
        required=True,
        tracking=True,
    )
    telefono = fields.Char(
        string='Teléfono',
        required=True,
        tracking=True,
    )
    email = fields.Char(
        string='Email',
        tracking=True,
    )

    # Relación con CRM
    lead_id = fields.Many2one(
        'crm.lead',
        string='Oportunidad',
        ondelete='set null',
        tracking=True,
        help='Lead/Oportunidad asociada en el CRM',
    )

    # Datos del servicio
    servicio = fields.Selection(
        selection=[
            ('corte_mujer', 'Corte mujer'),
            ('alisado_brasileno', 'Alisado brasileño'),
            ('alisado_keratina', 'Alisado keratina'),
            ('mechas_completas', 'Mechas completas'),
            ('tintura_raiz', 'Tintura raíz'),
            ('tintura_completa', 'Tintura completa'),
            ('balayage', 'Balayage'),
            ('manicura_simple', 'Manicura simple'),
            ('manicura_semipermanente', 'Manicura semipermanente'),
            ('pedicura', 'Pedicura'),
            ('depilacion_cera_piernas', 'Depilación cera piernas'),
            ('depilacion_cera_axilas', 'Depilación cera axilas'),
            ('depilacion_cera_bikini', 'Depilación cera bikini'),
            ('depilacion_laser_piernas', 'Depilación láser piernas'),
            ('depilacion_laser_axilas', 'Depilación láser axilas'),
        ],
        string='Servicio',
        required=True,
        tracking=True,
    )
    servicio_detalle = fields.Text(
        string='Detalle del Servicio',
        help='Descripción adicional del servicio solicitado',
    )

    # Fecha y duración
    fecha_hora = fields.Datetime(
        string='Fecha y Hora',
        required=True,
        tracking=True,
    )
    duracion = fields.Float(
        string='Duración (horas)',
        default=1.0,
        tracking=True,
    )
    fecha_fin = fields.Datetime(
        string='Fecha Fin',
        compute='_compute_fecha_fin',
        store=True,
    )

    # Precios y pagos
    precio = fields.Float(
        string='Precio Total',
        required=True,
        tracking=True,
    )
    sena = fields.Float(
        string='Seña (30%)',
        compute='_compute_sena',
        store=True,
    )
    sena_pagada = fields.Boolean(
        string='Seña Pagada',
        default=False,
        tracking=True,
    )
    monto_pago_pendiente = fields.Float(
        string='Monto Pago Pendiente',
        default=0,
        tracking=True,
        help='Monto real a cobrar en el próximo pago. '
             'Para turno nuevo: igual a seña (30%). '
             'Para agregar servicio: diferencia entre seña nueva y pagada.',
    )
    monto_restante = fields.Float(
        string='Monto Restante',
        compute='_compute_monto_restante',
        store=True,
    )

    # Mercado Pago
    link_pago = fields.Char(
        string='Link de Pago',
        readonly=True,
    )
    mp_preference_id = fields.Char(
        string='MP Preference ID',
        readonly=True,
    )
    mp_payment_id = fields.Char(
        string='MP Payment ID (último)',
        readonly=True,
        help='Último payment ID registrado (para compatibilidad). Ver pago_ids para historial completo.',
    )

    # Historial de pagos
    pago_ids = fields.One2many(
        'salon.turno.pago',
        'turno_id',
        string='Historial de Pagos',
    )
    total_pagado = fields.Float(
        string='Total Pagado',
        compute='_compute_total_pagado',
        store=True,
    )
    cantidad_pagos = fields.Integer(
        string='Cantidad de Pagos',
        compute='_compute_total_pagado',
        store=True,
    )

    # Calendario
    odoo_event_id = fields.Integer(
        string='Calendar Event ID',
        readonly=True,
        help='ID del evento de calendario asociado. '
             'Se usa para actualizar el evento existente en vez de crear duplicados.',
    )

    # Estado
    estado = fields.Selection(
        selection=[
            ('pendiente_pago', 'Pendiente de Pago'),
            ('confirmado', 'Confirmado'),
            ('completado', 'Completado'),
            ('cancelado', 'Cancelado'),
        ],
        string='Estado',
        default='pendiente_pago',
        required=True,
        tracking=True,
    )

    # Complejidad
    complejidad_maxima = fields.Selection(
        selection=[
            ('simple', 'Simple'),
            ('media', 'Media'),
            ('compleja', 'Compleja'),
            ('muy_compleja', 'Muy Compleja'),
        ],
        string='Complejidad Máxima',
        tracking=True,
        help='Nivel de complejidad del turno (determina capacidad del salón)',
    )

    # Trabajadora
    trabajadora = fields.Selection(
        selection=[
            ('leraysi', 'Leraysi'),
            ('companera', 'Compañera'),
        ],
        string='Trabajadora',
        default='leraysi',
        tracking=True,
    )

    # Cambios pendientes (staging para agregar servicio - separación de responsabilidades)
    pending_changes = fields.Text(
        string='Cambios Pendientes',
        help='JSON con cambios a aplicar post-pago al agregar servicio. '
             'Se aplican en mercadopago_webhook al confirmar pago. '
             'Se limpian al expirar el link de pago.',
    )

    # Notas
    notas = fields.Text(
        string='Notas',
    )

    @api.depends('duracion', 'fecha_hora')
    def _compute_fecha_fin(self):
        for record in self:
            if record.fecha_hora and record.duracion:
                record.fecha_fin = fields.Datetime.add(
                    record.fecha_hora,
                    hours=record.duracion
                )
            else:
                record.fecha_fin = False

    @api.depends('precio')
    def _compute_sena(self):
        for record in self:
            record.sena = record.precio * 0.30

    @api.depends('precio', 'sena', 'sena_pagada')
    def _compute_monto_restante(self):
        for record in self:
            if record.sena_pagada:
                record.monto_restante = record.precio - record.sena
            else:
                record.monto_restante = record.precio

    @api.depends('pago_ids', 'pago_ids.monto', 'pago_ids.estado')
    def _compute_total_pagado(self):
        for record in self:
            pagos_aprobados = record.pago_ids.filtered(lambda p: p.estado == 'approved')
            record.total_pagado = sum(pagos_aprobados.mapped('monto'))
            record.cantidad_pagos = len(pagos_aprobados)

    def action_generar_link_pago(self):
        """Genera link de pago en Mercado Pago para la seña"""
        self.ensure_one()

        # Obtener configuración de MP
        mp_access_token = self.env['ir.config_parameter'].sudo().get_param(
            'salon_turnos.mp_access_token'
        )

        if not mp_access_token:
            raise UserError(
                'No se ha configurado el Access Token de Mercado Pago. '
                'Configure en Ajustes > Parámetros del Sistema > salon_turnos.mp_access_token'
            )

        # Determinar monto a cobrar: monto_pago_pendiente si está seteado, sino seña estándar
        monto_a_cobrar = self.monto_pago_pendiente if self.monto_pago_pendiente > 0 else self.sena

        # Crear preferencia de pago
        # NOTA: notification_url se configura desde el panel de MercadoPago,
        # no desde el código, para evitar problemas con webhooks IPN legacy.
        # Configurar en: https://www.mercadopago.com.ar/developers/panel/app/{APP_ID}/webhooks

        preference_data = {
            'items': [{
                'title': f'Seña - {self.servicio} - Estilos Leraysi',
                'description': f'Turno para {self.clienta} el {self.fecha_hora}',
                'quantity': 1,
                'currency_id': 'ARS',
                'unit_price': monto_a_cobrar,
            }],
            'payer': {
                'name': self.clienta,
                'phone': {'number': self.telefono},
            },
            'external_reference': str(self.id),
            # notification_url: Se configura desde panel MP, no desde código
            'back_urls': {
                'success': f'{self.env["ir.config_parameter"].sudo().get_param("web.base.url")}/salon_turnos/pago/exito',
                'failure': f'{self.env["ir.config_parameter"].sudo().get_param("web.base.url")}/salon_turnos/pago/error',
                'pending': f'{self.env["ir.config_parameter"].sudo().get_param("web.base.url")}/salon_turnos/pago/pendiente',
            },
            'auto_return': 'approved',
            # Expirar link en 15 minutos — MP rechaza pagos despues de esto
            # fields.Datetime.now() devuelve UTC, usar +00:00 para que MP lo interprete correctamente
            'expiration_date_from': fields.Datetime.now().strftime('%Y-%m-%dT%H:%M:%S.000+00:00'),
            'expiration_date_to': (fields.Datetime.now() + timedelta(minutes=15)).strftime('%Y-%m-%dT%H:%M:%S.000+00:00'),
        }

        try:
            response = requests.post(
                'https://api.mercadopago.com/checkout/preferences',
                json=preference_data,
                headers={
                    'Authorization': f'Bearer {mp_access_token}',
                    'Content-Type': 'application/json',
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

            self.write({
                'link_pago': data.get('init_point'),
                'mp_preference_id': data.get('id'),
            })

            _logger.info(
                f'Link de pago generado para turno {self.id}: {self.link_pago} '
                f'(monto: {monto_a_cobrar})'
            )

            return {
                'type': 'ir.actions.act_url',
                'url': self.link_pago,
                'target': 'new',
            }

        except requests.exceptions.RequestException as e:
            _logger.error(f'Error al generar link de pago: {e}')
            raise UserError(f'Error al conectar con Mercado Pago: {e}')

    def action_confirmar_pago_manual(self):
        """Confirma el pago manualmente (sin MP)"""
        self.ensure_one()
        self.write({
            'sena_pagada': True,
            'estado': 'confirmado',
        })
        self.message_post(body='Pago de seña confirmado manualmente')

    def action_completar(self):
        """Marca el turno como completado"""
        self.ensure_one()
        self.write({'estado': 'completado'})
        self.message_post(body='Turno completado')

    def action_cancelar(self):
        """Cancela el turno"""
        self.ensure_one()
        self.write({'estado': 'cancelado'})
        self.message_post(body='Turno cancelado')

    def action_reabrir(self):
        """Reabre un turno cancelado"""
        self.ensure_one()
        if self.sena_pagada:
            self.write({'estado': 'confirmado'})
        else:
            self.write({'estado': 'pendiente_pago'})
        self.message_post(body='Turno reabierto')

    def render_invoice_pdf(self, report_name, record_ids):
        """
        Wrapper público para generar PDF de factura via XML-RPC.
        _render_qweb_pdf es privado y no se puede llamar por XML-RPC.

        Args:
            report_name: str - nombre del reporte (ej: 'account.account_invoices')
            record_ids: list[int] - IDs de los registros a renderizar

        Returns:
            list[str, str] - [pdf_base64, report_type]
        """
        report = self.env['ir.actions.report']._get_report_from_name(report_name)
        if not report:
            raise UserError(f'Reporte no encontrado: {report_name}')

        pdf_content, report_type = report._render_qweb_pdf(
            report_name, record_ids
        )
        pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
        return [pdf_base64, report_type]

    @api.model
    def api_crear_turno(self, data):
        """
        API para crear turno desde el agente AI.

        Args:
            data: dict con campos del turno
                - clienta: str (requerido)
                - telefono: str (requerido)
                - servicio: str (requerido)
                - fecha_hora: str ISO format (requerido)
                - precio: float (requerido)
                - duracion: float (opcional, default 1.0)
                - email: str (opcional)
                - notas: str (opcional)
                - generar_link_pago: bool (opcional, default True)

        Returns:
            dict con datos del turno creado
        """
        required_fields = ['clienta', 'telefono', 'servicio', 'fecha_hora', 'precio']
        for field in required_fields:
            if field not in data:
                raise UserError(f'Campo requerido faltante: {field}')

        # Crear turno (fecha_hora ya viene en UTC desde odoo-mcp)
        turno_vals = {
            'clienta': data['clienta'],
            'telefono': data['telefono'],
            'servicio': data['servicio'],
            'fecha_hora': data['fecha_hora'],
            'precio': float(data['precio']),
            'duracion': float(data.get('duracion', 1.0)),
            'email': data.get('email'),
            'notas': data.get('notas'),
            'servicio_detalle': data.get('servicio_detalle'),
        }

        # Agregar lead_id si se proporciona
        if data.get('lead_id'):
            turno_vals['lead_id'] = int(data['lead_id'])

        # Agregar complejidad_maxima si se proporciona
        if data.get('complejidad_maxima'):
            turno_vals['complejidad_maxima'] = data['complejidad_maxima']

        # Agregar trabajadora si se proporciona
        if data.get('trabajadora'):
            turno_vals['trabajadora'] = data['trabajadora']

        turno = self.create(turno_vals)

        # Generar link de pago si se solicita
        if data.get('generar_link_pago', True):
            try:
                turno.action_generar_link_pago()
            except UserError as e:
                _logger.warning(f'No se pudo generar link de pago: {e}')

        return turno._to_dict()

    @api.model
    def api_buscar_turnos(self, filtros=None):
        """
        API para buscar turnos desde el agente AI.

        Args:
            filtros: dict con filtros opcionales
                - clienta: str (búsqueda parcial)
                - telefono: str (búsqueda exacta)
                - fecha_desde: str ISO date
                - fecha_hasta: str ISO date
                - estado: str
                - servicio: str

        Returns:
            list de dicts con turnos encontrados
        """
        domain = []

        if filtros:
            if filtros.get('clienta'):
                domain.append(('clienta', 'ilike', filtros['clienta']))
            if filtros.get('telefono'):
                domain.append(('telefono', '=', filtros['telefono']))
            if filtros.get('fecha_desde'):
                domain.append(('fecha_hora', '>=', filtros['fecha_desde']))
            if filtros.get('fecha_hasta'):
                domain.append(('fecha_hora', '<=', filtros['fecha_hasta']))
            if filtros.get('estado'):
                domain.append(('estado', '=', filtros['estado']))
            if filtros.get('servicio'):
                domain.append(('servicio', '=', filtros['servicio']))
            if filtros.get('trabajadora'):
                domain.append(('trabajadora', '=', filtros['trabajadora']))

        turnos = self.search(domain, order='fecha_hora desc', limit=100)
        return [turno._to_dict() for turno in turnos]

    @api.model
    def api_obtener_turno(self, turno_id):
        """
        API para obtener un turno específico.

        Args:
            turno_id: int ID del turno

        Returns:
            dict con datos del turno o None si no existe
        """
        turno = self.browse(turno_id)
        if turno.exists():
            return turno._to_dict()
        return None

    def action_aplicar_pending_changes(self):
        """
        Aplica los cambios pendientes (staging) al turno post-pago.

        Llamado desde mercadopago_webhook.py cuando se confirma el pago
        de un servicio agregado. Los campos definitivos (servicio, precio,
        duracion, complejidad) se aplican aquí, no al momento de agregar.
        """
        self.ensure_one()
        if not self.pending_changes:
            return

        try:
            changes = json.loads(self.pending_changes)
        except (json.JSONDecodeError, TypeError) as e:
            _logger.error(f'[PendingChanges] Error parseando JSON turno {self.id}: {e}')
            return

        # Campos permitidos para aplicar (whitelist de seguridad)
        ALLOWED_FIELDS = {
            'servicio', 'servicio_detalle', 'precio', 'duracion',
            'complejidad_maxima', 'fecha_hora',
        }

        update_vals = {k: v for k, v in changes.items() if k in ALLOWED_FIELDS}
        update_vals['pending_changes'] = False  # Limpiar staging

        self.write(update_vals)

        _logger.info(
            f'[PendingChanges] Aplicados cambios pendientes a turno {self.id}: '
            f'{list(update_vals.keys())}'
        )
        self.message_post(
            body=f'Servicio agregado confirmado post-pago: '
                 f'{changes.get("servicio_detalle", "")}'
        )

    @api.model
    def api_revertir_servicio_agregado(self, turno_id):
        """
        Revierte un turno a estado confirmado cuando el pago del servicio
        agregado expira. Limpia campos de pago pendiente y staging.

        Como los campos definitivos (servicio, precio, duracion) nunca se
        modificaron (separación de responsabilidades), solo hay que limpiar
        los campos de pago y el staging.

        Args:
            turno_id: int ID del turno

        Returns:
            dict con resultado
        """
        turno = self.browse(turno_id)
        if not turno.exists():
            _logger.warning(f'[Revertir] Turno {turno_id} no encontrado')
            return {'success': False, 'message': f'Turno {turno_id} not found'}

        # Solo revertir si está pendiente_pago (evitar revertir turnos ya confirmados)
        if turno.estado != 'pendiente_pago':
            _logger.info(
                f'[Revertir] Turno {turno_id} no está pendiente_pago '
                f'(estado={turno.estado}), ignorando'
            )
            return {'success': False, 'message': f'Turno not in pendiente_pago state'}

        # Restaurar link_pago y mp_preference_id originales desde pending_changes
        original_link_pago = False
        original_mp_preference_id = False
        if turno.pending_changes:
            try:
                changes = json.loads(turno.pending_changes)
                original_link_pago = changes.get('_original_link_pago') or False
                original_mp_preference_id = changes.get('_original_mp_preference_id') or False
            except (json.JSONDecodeError, TypeError):
                pass

        turno.write({
            'estado': 'confirmado',
            'monto_pago_pendiente': 0,
            'link_pago': original_link_pago,
            'mp_preference_id': original_mp_preference_id,
            'pending_changes': False,
        })

        turno.message_post(
            body='Seña adicional expirada. Servicio agregado revertido. '
                 'Turno original mantenido.'
        )

        _logger.info(f'[Revertir] Turno {turno_id} revertido a confirmado')
        return {'success': True, 'message': 'Reverted to confirmed'}

    @api.model
    def api_post_message(self, turno_id, body_html, subtype='mail.mt_note'):
        """
        Postea un mensaje HTML en el chatter sin que Odoo lo escape.
        Usa Markup() para que el HTML se renderice correctamente.

        Args:
            turno_id: int ID del turno
            body_html: str HTML del mensaje
            subtype: str xmlid del subtipo (default: mail.mt_note)
        """
        from markupsafe import Markup
        turno = self.browse(turno_id)
        if not turno.exists():
            return False
        turno.message_post(
            body=Markup(body_html),
            message_type='comment',
            subtype_xmlid=subtype,
        )
        return True

    def _to_dict(self):
        """Convierte el turno a diccionario para la API"""
        self.ensure_one()
        return {
            'id': self.id,
            'clienta': self.clienta,
            'telefono': self.telefono,
            'email': self.email,
            'lead_id': self.lead_id.id if self.lead_id else None,
            'servicio': self.servicio,
            'servicio_detalle': self.servicio_detalle,
            'fecha_hora': self.fecha_hora.isoformat() if self.fecha_hora else None,
            'fecha_fin': self.fecha_fin.isoformat() if self.fecha_fin else None,
            'duracion': self.duracion,
            'precio': self.precio,
            'sena': self.sena,
            'sena_pagada': self.sena_pagada,
            'monto_pago_pendiente': self.monto_pago_pendiente,
            'monto_restante': self.monto_restante,
            'link_pago': self.link_pago,
            'mp_preference_id': self.mp_preference_id,
            'mp_payment_id': self.mp_payment_id,
            'total_pagado': self.total_pagado,
            'cantidad_pagos': self.cantidad_pagos,
            'pagos': [{
                'id': p.id,
                'mp_payment_id': p.mp_payment_id,
                'monto': p.monto,
                'tipo': p.tipo,
                'estado': p.estado,
                'fecha': p.fecha.isoformat() if p.fecha else None,
                'descripcion': p.descripcion,
            } for p in self.pago_ids],
            'odoo_event_id': self.odoo_event_id,
            'complejidad_maxima': self.complejidad_maxima,
            'trabajadora': self.trabajadora,
            'estado': self.estado,
            'notas': self.notas,
            'create_date': self.create_date.isoformat() if self.create_date else None,
        }
