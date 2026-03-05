import json
import logging
import requests
import base64
from datetime import timedelta
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class AppointmentBooking(models.Model):
    _name = 'appointment.booking'
    _description = 'Appointment Booking'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'scheduled_datetime desc'

    # Client data
    client_name = fields.Char(
        string='Client Name',
        required=True,
        tracking=True,
    )
    phone = fields.Char(
        string='Phone',
        required=True,
        tracking=True,
    )
    email = fields.Char(
        string='Email',
        tracking=True,
    )

    # CRM relation
    lead_id = fields.Many2one(
        'crm.lead',
        string='Opportunity',
        ondelete='set null',
        tracking=True,
        help='Associated Lead/Opportunity in CRM',
    )

    # Service data
    service_type = fields.Selection(
        selection=[
            ('corte_mujer', 'Women Haircut'),
            ('alisado_brasileno', 'Brazilian Straightening'),
            ('alisado_keratina', 'Keratin Straightening'),
            ('mechas_completas', 'Full Highlights'),
            ('tintura_raiz', 'Root Coloring'),
            ('tintura_completa', 'Full Coloring'),
            ('balayage', 'Balayage'),
            ('manicura_simple', 'Simple Manicure'),
            ('manicura_semipermanente', 'Semi-permanent Manicure'),
            ('pedicura', 'Pedicure'),
            ('depilacion_cera_piernas', 'Leg Wax Hair Removal'),
            ('depilacion_cera_axilas', 'Underarm Wax Hair Removal'),
            ('depilacion_cera_bikini', 'Bikini Wax Hair Removal'),
            ('depilacion_laser_piernas', 'Leg Laser Hair Removal'),
            ('depilacion_laser_axilas', 'Underarm Laser Hair Removal'),
        ],
        string='Service Type',
        required=True,
        tracking=True,
    )
    service_detail = fields.Text(
        string='Service Detail',
        help='Additional description of the requested service',
    )

    # Date and duration
    scheduled_datetime = fields.Datetime(
        string='Scheduled Date & Time',
        required=True,
        tracking=True,
    )
    duration_hours = fields.Float(
        string='Duration (hours)',
        default=1.0,
        tracking=True,
    )
    end_datetime = fields.Datetime(
        string='End Date & Time',
        compute='_compute_end_datetime',
        store=True,
    )

    # Prices and payments
    total_price = fields.Float(
        string='Total Price',
        required=True,
        tracking=True,
    )
    deposit_amount = fields.Float(
        string='Deposit (30%)',
        compute='_compute_deposit_amount',
        store=True,
    )
    deposit_paid = fields.Boolean(
        string='Deposit Paid',
        default=False,
        tracking=True,
    )
    pending_payment_amount = fields.Float(
        string='Pending Payment Amount',
        default=0,
        tracking=True,
        help='Actual amount to collect in next payment. '
             'For new booking: equals deposit (30%). '
             'For added service: difference between new and paid deposit.',
    )
    remaining_amount = fields.Float(
        string='Remaining Amount',
        compute='_compute_remaining_amount',
        store=True,
    )

    # Mercado Pago
    payment_link = fields.Char(
        string='Payment Link',
        readonly=True,
    )
    mp_preference_id = fields.Char(
        string='MP Preference ID',
        readonly=True,
    )
    mp_payment_id = fields.Char(
        string='MP Payment ID',
        readonly=True,
        help='Last registered payment ID (for compatibility). See payment_ids for full history.',
    )

    # Payment history
    payment_ids = fields.One2many(
        'appointment.payment',
        'booking_id',
        string='Payment History',
    )
    total_paid = fields.Float(
        string='Total Paid',
        compute='_compute_total_paid',
        store=True,
    )
    payment_count = fields.Integer(
        string='Payment Count',
        compute='_compute_total_paid',
        store=True,
    )

    # Calendar
    calendar_event_id = fields.Integer(
        string='Calendar Event ID',
        readonly=True,
        help='Associated calendar event ID. '
             'Used to update existing event instead of creating duplicates.',
    )

    # Status
    state = fields.Selection(
        selection=[
            ('pending_payment', 'Pending Payment'),
            ('confirmed', 'Confirmed'),
            ('completed', 'Completed'),
            ('cancelled', 'Cancelled'),
        ],
        string='Status',
        default='pending_payment',
        required=True,
        tracking=True,
    )

    # Complexity
    max_complexity = fields.Selection(
        selection=[
            ('simple', 'Simple'),
            ('medium', 'Medium'),
            ('complex', 'Complex'),
            ('very_complex', 'Very Complex'),
        ],
        string='Max Complexity',
        tracking=True,
        help='Complexity level of the booking (determines salon capacity)',
    )

    # Worker
    worker = fields.Selection(
        selection=[
            ('primary', 'Primary'),
            ('secondary', 'Secondary'),
        ],
        string='Worker',
        default='primary',
        tracking=True,
    )

    # Pending changes (staging for adding service - separation of concerns)
    pending_changes = fields.Text(
        string='Pending Changes',
        help='JSON with changes to apply post-payment when adding a service. '
             'Applied in mercadopago_webhook upon payment confirmation. '
             'Cleared when the payment link expires.',
    )

    # Notes
    notes = fields.Text(
        string='Notes',
    )

    # Parent booking
    parent_booking_id = fields.Many2one(
        'appointment.booking',
        string='Parent Booking',
        ondelete='set null',
    )

    @api.depends('duration_hours', 'scheduled_datetime')
    def _compute_end_datetime(self):
        for record in self:
            if record.scheduled_datetime and record.duration_hours:
                record.end_datetime = fields.Datetime.add(
                    record.scheduled_datetime,
                    hours=record.duration_hours
                )
            else:
                record.end_datetime = False

    @api.depends('total_price')
    def _compute_deposit_amount(self):
        for record in self:
            record.deposit_amount = record.total_price * 0.30

    @api.depends('total_price', 'deposit_amount', 'deposit_paid')
    def _compute_remaining_amount(self):
        for record in self:
            if record.deposit_paid:
                record.remaining_amount = record.total_price - record.deposit_amount
            else:
                record.remaining_amount = record.total_price

    @api.depends('payment_ids', 'payment_ids.amount', 'payment_ids.state')
    def _compute_total_paid(self):
        for record in self:
            approved_payments = record.payment_ids.filtered(lambda p: p.state == 'approved')
            record.total_paid = sum(approved_payments.mapped('amount'))
            record.payment_count = len(approved_payments)

    def action_generate_payment_link(self):
        """Generates a Mercado Pago payment link for the deposit"""
        self.ensure_one()

        # Get MP configuration
        mp_access_token = self.env['ir.config_parameter'].sudo().get_param(
            'appointment.mp_access_token'
        )

        if not mp_access_token:
            raise UserError(
                'Mercado Pago Access Token not configured. '
                'Set it in Settings > System Parameters > appointment.mp_access_token'
            )

        # Determine amount to charge: pending_payment_amount if set, otherwise standard deposit
        charge_amount = self.pending_payment_amount if self.pending_payment_amount > 0 else self.deposit_amount

        # Create payment preference
        # NOTE: notification_url is configured from the MercadoPago panel,
        # not from code, to avoid issues with IPN legacy webhooks.
        # Configure at: https://www.mercadopago.com.ar/developers/panel/app/{APP_ID}/webhooks

        preference_data = {
            'items': [{
                'title': f'Deposit - {self.service_type} - Estilos Leraysi',
                'description': f'Booking for {self.client_name} on {self.scheduled_datetime}',
                'quantity': 1,
                'currency_id': 'ARS',
                'unit_price': charge_amount,
            }],
            'payer': {
                'name': self.client_name,
                'phone': {'number': self.phone},
            },
            'external_reference': str(self.id),
            # notification_url: Configured from MP panel, not from code
            'back_urls': {
                'success': f'{self.env["ir.config_parameter"].sudo().get_param("web.base.url")}/appointment/payment/success',
                'failure': f'{self.env["ir.config_parameter"].sudo().get_param("web.base.url")}/appointment/payment/failure',
                'pending': f'{self.env["ir.config_parameter"].sudo().get_param("web.base.url")}/appointment/payment/pending',
            },
            'auto_return': 'approved',
            # Expire link in 15 minutes — MP rejects payments after this
            # fields.Datetime.now() returns UTC, use +00:00 so MP interprets it correctly
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
                'payment_link': data.get('init_point'),
                'mp_preference_id': data.get('id'),
            })

            _logger.info(
                f'Payment link generated for booking {self.id}: {self.payment_link} '
                f'(amount: {charge_amount})'
            )

            return {
                'type': 'ir.actions.act_url',
                'url': self.payment_link,
                'target': 'new',
            }

        except requests.exceptions.RequestException as e:
            _logger.error(f'Error generating payment link: {e}')
            raise UserError(f'Error connecting to Mercado Pago: {e}')

    def action_confirm_manual_payment(self):
        """Confirms payment manually (without MP)"""
        self.ensure_one()
        self.write({
            'deposit_paid': True,
            'state': 'confirmed',
        })
        self.message_post(body='Deposit payment confirmed manually')

    def action_complete(self):
        """Marks the booking as completed"""
        self.ensure_one()
        self.write({'state': 'completed'})
        self.message_post(body='Booking completed')

    def action_cancel(self):
        """Cancels the booking"""
        self.ensure_one()
        self.write({'state': 'cancelled'})
        self.message_post(body='Booking cancelled')

    def action_reopen(self):
        """Reopens a cancelled booking"""
        self.ensure_one()
        if self.deposit_paid:
            self.write({'state': 'confirmed'})
        else:
            self.write({'state': 'pending_payment'})
        self.message_post(body='Booking reopened')

    def render_invoice_pdf(self, report_name, record_ids):
        """
        Public wrapper to generate invoice PDF via XML-RPC.
        _render_qweb_pdf is private and cannot be called via XML-RPC.

        Args:
            report_name: str - report name (e.g.: 'account.account_invoices')
            record_ids: list[int] - IDs of records to render

        Returns:
            list[str, str] - [pdf_base64, report_type]
        """
        report = self.env['ir.actions.report']._get_report_from_name(report_name)
        if not report:
            raise UserError(f'Report not found: {report_name}')

        pdf_content, report_type = report._render_qweb_pdf(
            report_name, record_ids
        )
        pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
        return [pdf_base64, report_type]

    @api.model
    def api_create_booking(self, data):
        """
        API to create a booking from the AI agent.

        Args:
            data: dict with booking fields
                - client_name: str (required)
                - phone: str (required)
                - service_type: str (required)
                - scheduled_datetime: str ISO format (required)
                - total_price: float (required)
                - duration_hours: float (optional, default 1.0)
                - email: str (optional)
                - notes: str (optional)
                - generate_payment_link: bool (optional, default True)

        Returns:
            dict with created booking data
        """
        required_fields = ['client_name', 'phone', 'service_type', 'scheduled_datetime', 'total_price']
        for field in required_fields:
            if field not in data:
                raise UserError(f'Missing required field: {field}')

        # Create booking (scheduled_datetime already comes in UTC from odoo-mcp)
        booking_vals = {
            'client_name': data['client_name'],
            'phone': data['phone'],
            'service_type': data['service_type'],
            'scheduled_datetime': data['scheduled_datetime'],
            'total_price': float(data['total_price']),
            'duration_hours': float(data.get('duration_hours', 1.0)),
            'email': data.get('email'),
            'notes': data.get('notes'),
            'service_detail': data.get('service_detail'),
        }

        # Add lead_id if provided
        if data.get('lead_id'):
            booking_vals['lead_id'] = int(data['lead_id'])

        # Add max_complexity if provided
        if data.get('max_complexity'):
            booking_vals['max_complexity'] = data['max_complexity']

        # Add worker if provided
        if data.get('worker'):
            booking_vals['worker'] = data['worker']

        booking = self.create(booking_vals)

        # Generate payment link if requested
        if data.get('generate_payment_link', True):
            try:
                booking.action_generate_payment_link()
            except UserError as e:
                _logger.warning(f'Could not generate payment link: {e}')

        return booking._to_dict()

    @api.model
    def api_search_bookings(self, filters=None):
        """
        API to search bookings from the AI agent.

        Args:
            filters: dict with optional filters
                - client_name: str (partial search)
                - phone: str (exact match)
                - date_from: str ISO date
                - date_to: str ISO date
                - state: str
                - service_type: str

        Returns:
            list of dicts with found bookings
        """
        domain = []

        if filters:
            if filters.get('client_name'):
                domain.append(('client_name', 'ilike', filters['client_name']))
            if filters.get('phone'):
                domain.append(('phone', '=', filters['phone']))
            if filters.get('date_from'):
                domain.append(('scheduled_datetime', '>=', filters['date_from']))
            if filters.get('date_to'):
                domain.append(('scheduled_datetime', '<=', filters['date_to']))
            if filters.get('state'):
                domain.append(('state', '=', filters['state']))
            if filters.get('service_type'):
                domain.append(('service_type', '=', filters['service_type']))
            if filters.get('worker'):
                domain.append(('worker', '=', filters['worker']))

        bookings = self.search(domain, order='scheduled_datetime desc', limit=100)
        return [booking._to_dict() for booking in bookings]

    @api.model
    def api_get_booking(self, booking_id):
        """
        API to get a specific booking.

        Args:
            booking_id: int booking ID

        Returns:
            dict with booking data or None if not found
        """
        booking = self.browse(booking_id)
        if booking.exists():
            return booking._to_dict()
        return None

    def action_apply_pending_changes(self):
        """
        Applies pending changes (staging) to the booking post-payment.

        Called from mercadopago_webhook.py when payment for an added service
        is confirmed. The definitive fields (service, price, duration,
        complexity) are applied here, not at the time of adding.
        """
        self.ensure_one()
        if not self.pending_changes:
            return

        try:
            changes = json.loads(self.pending_changes)
        except (json.JSONDecodeError, TypeError) as e:
            _logger.error(f'[PendingChanges] Error parsing JSON for booking {self.id}: {e}')
            return

        # Allowed fields to apply (security whitelist)
        ALLOWED_FIELDS = {
            'service_type', 'service_detail', 'total_price', 'duration_hours',
            'max_complexity', 'scheduled_datetime',
        }

        update_vals = {k: v for k, v in changes.items() if k in ALLOWED_FIELDS}
        update_vals['pending_changes'] = False  # Clear staging

        self.write(update_vals)

        _logger.info(
            f'[PendingChanges] Applied pending changes to booking {self.id}: '
            f'{list(update_vals.keys())}'
        )
        self.message_post(
            body=f'Added service confirmed post-payment: '
                 f'{changes.get("service_detail", "")}'
        )

    @api.model
    def api_revert_added_service(self, booking_id):
        """
        Reverts a booking to confirmed state when the added service payment
        expires. Clears pending payment and staging fields.

        Since the definitive fields (service, price, duration) were never
        modified (separation of concerns), only payment and staging fields
        need to be cleared.

        Args:
            booking_id: int booking ID

        Returns:
            dict with result
        """
        booking = self.browse(booking_id)
        if not booking.exists():
            _logger.warning(f'[Revert] Booking {booking_id} not found')
            return {'success': False, 'message': f'Booking {booking_id} not found'}

        # Only revert if pending_payment (avoid reverting already confirmed bookings)
        if booking.state != 'pending_payment':
            _logger.info(
                f'[Revert] Booking {booking_id} is not pending_payment '
                f'(state={booking.state}), ignoring'
            )
            return {'success': False, 'message': f'Booking not in pending_payment state'}

        # Restore original payment_link and mp_preference_id from pending_changes
        original_payment_link = False
        original_mp_preference_id = False
        if booking.pending_changes:
            try:
                changes = json.loads(booking.pending_changes)
                original_payment_link = changes.get('_original_payment_link') or False
                original_mp_preference_id = changes.get('_original_mp_preference_id') or False
            except (json.JSONDecodeError, TypeError):
                pass

        booking.write({
            'state': 'confirmed',
            'pending_payment_amount': 0,
            'payment_link': original_payment_link,
            'mp_preference_id': original_mp_preference_id,
            'pending_changes': False,
        })

        booking.message_post(
            body='Additional deposit expired. Added service reverted. '
                 'Original booking maintained.'
        )

        _logger.info(f'[Revert] Booking {booking_id} reverted to confirmed')
        return {'success': True, 'message': 'Reverted to confirmed'}

    @api.model
    def api_post_message(self, booking_id, body_html, subtype='mail.mt_note'):
        """
        Posts an HTML message in the chatter without Odoo escaping it.
        Uses Markup() so HTML renders correctly.

        Args:
            booking_id: int booking ID
            body_html: str HTML message
            subtype: str subtype xmlid (default: mail.mt_note)
        """
        from markupsafe import Markup
        booking = self.browse(booking_id)
        if not booking.exists():
            return False
        booking.message_post(
            body=Markup(body_html),
            message_type='comment',
            subtype_xmlid=subtype,
        )
        return True

    def _to_dict(self):
        """Converts the booking to a dictionary for the API"""
        self.ensure_one()
        return {
            'id': self.id,
            'client_name': self.client_name,
            'phone': self.phone,
            'email': self.email,
            'lead_id': self.lead_id.id if self.lead_id else None,
            'service_type': self.service_type,
            'service_detail': self.service_detail,
            'scheduled_datetime': self.scheduled_datetime.isoformat() if self.scheduled_datetime else None,
            'end_datetime': self.end_datetime.isoformat() if self.end_datetime else None,
            'duration_hours': self.duration_hours,
            'total_price': self.total_price,
            'deposit_amount': self.deposit_amount,
            'deposit_paid': self.deposit_paid,
            'pending_payment_amount': self.pending_payment_amount,
            'remaining_amount': self.remaining_amount,
            'payment_link': self.payment_link,
            'mp_preference_id': self.mp_preference_id,
            'mp_payment_id': self.mp_payment_id,
            'total_paid': self.total_paid,
            'payment_count': self.payment_count,
            'payments': [{
                'id': p.id,
                'mp_payment_id': p.mp_payment_id,
                'amount': p.amount,
                'payment_type': p.payment_type,
                'state': p.state,
                'payment_date': p.payment_date.isoformat() if p.payment_date else None,
                'description': p.description,
            } for p in self.payment_ids],
            'calendar_event_id': self.calendar_event_id,
            'max_complexity': self.max_complexity,
            'worker': self.worker,
            'state': self.state,
            'notes': self.notes,
            'create_date': self.create_date.isoformat() if self.create_date else None,
        }
