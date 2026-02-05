import logging
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class SalonTurnoPago(models.Model):
    """
    Historial de pagos para turnos del salón.

    Cada pago de MercadoPago se registra aquí, permitiendo:
    - Múltiples pagos por turno (seña inicial + seña adicional por servicio agregado)
    - Historial completo de transacciones
    - Trazabilidad de cada payment_id de MP
    """
    _name = 'salon.turno.pago'
    _description = 'Pago de Turno'
    _order = 'fecha desc'

    turno_id = fields.Many2one(
        'salon.turno',
        string='Turno',
        required=True,
        ondelete='cascade',
        index=True,
    )

    # Datos de MercadoPago
    mp_payment_id = fields.Char(
        string='MP Payment ID',
        required=True,
        index=True,
    )
    mp_preference_id = fields.Char(
        string='MP Preference ID',
        help='ID de la preferencia de pago que generó este cobro',
    )

    # Monto y tipo
    monto = fields.Float(
        string='Monto',
        required=True,
    )
    tipo = fields.Selection(
        selection=[
            ('sena', 'Seña Inicial'),
            ('sena_adicional', 'Seña Adicional'),
            ('saldo', 'Saldo Final'),
        ],
        string='Tipo de Pago',
        default='sena',
        required=True,
    )

    # Estado y fechas
    estado = fields.Selection(
        selection=[
            ('approved', 'Aprobado'),
            ('pending', 'Pendiente'),
            ('rejected', 'Rechazado'),
            ('cancelled', 'Cancelado'),
        ],
        string='Estado',
        default='approved',
        required=True,
    )
    fecha = fields.Datetime(
        string='Fecha de Pago',
        default=fields.Datetime.now,
        required=True,
    )

    # Datos adicionales del pago
    payer_email = fields.Char(
        string='Email del Pagador',
    )
    status_detail = fields.Char(
        string='Detalle de Estado',
        help='Detalle del estado del pago según MercadoPago',
    )

    # Descripción
    descripcion = fields.Char(
        string='Descripción',
        help='Descripción del pago (ej: Seña por Manicura semipermanente)',
    )

    _sql_constraints = [
        ('mp_payment_id_unique', 'UNIQUE(mp_payment_id)',
         'El Payment ID de MercadoPago debe ser único'),
    ]

    @api.model
    def registrar_pago(self, turno, payment_id, payment_data, tipo='sena'):
        """
        Registra un nuevo pago para un turno.

        Args:
            turno: record de salon.turno
            payment_id: ID del pago de MercadoPago
            payment_data: dict con datos del pago de la API de MP
            tipo: 'sena', 'sena_adicional', o 'saldo'

        Returns:
            record de salon.turno.pago creado
        """
        # Verificar si ya existe este pago (deduplicación)
        existing = self.search([('mp_payment_id', '=', str(payment_id))], limit=1)
        if existing:
            _logger.info(f'Pago {payment_id} ya registrado, retornando existente')
            return existing

        # Determinar monto del pago
        monto = payment_data.get('transaction_amount', 0)

        # Crear registro de pago
        pago = self.create({
            'turno_id': turno.id,
            'mp_payment_id': str(payment_id),
            'mp_preference_id': turno.mp_preference_id,
            'monto': monto,
            'tipo': tipo,
            'estado': payment_data.get('status', 'approved'),
            'payer_email': payment_data.get('payer', {}).get('email'),
            'status_detail': payment_data.get('status_detail'),
            'descripcion': f'{tipo.replace("_", " ").title()} - {turno.servicio_detalle or turno.servicio}',
        })

        _logger.info(f'Pago {payment_id} registrado para turno {turno.id}: ${monto} ({tipo})')
        return pago
