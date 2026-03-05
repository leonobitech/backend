import json
import logging
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class AppointmentPayment(models.Model):
    """
    Payment history for appointment bookings.

    Each MercadoPago payment is recorded here, enabling:
    - Multiple payments per booking (initial deposit + additional deposit for added service)
    - Complete transaction history
    - Traceability of each MP payment_id
    """
    _name = 'appointment.payment'
    _description = 'Appointment Payment'
    _order = 'payment_date desc'

    booking_id = fields.Many2one(
        'appointment.booking',
        string='Booking',
        required=True,
        ondelete='cascade',
        index=True,
    )

    # MercadoPago data
    mp_payment_id = fields.Char(
        string='MP Payment ID',
        required=True,
        index=True,
    )
    mp_preference_id = fields.Char(
        string='MP Preference ID',
        help='Payment preference ID that generated this charge',
    )

    # Amount and type
    amount = fields.Float(
        string='Amount',
        required=True,
    )
    payment_type = fields.Selection(
        selection=[
            ('deposit', 'Initial Deposit'),
            ('additional_deposit', 'Additional Deposit'),
            ('balance', 'Final Balance'),
        ],
        string='Payment Type',
        default='deposit',
        required=True,
    )

    # Status and dates
    state = fields.Selection(
        selection=[
            ('approved', 'Approved'),
            ('pending', 'Pending'),
            ('rejected', 'Rejected'),
            ('cancelled', 'Cancelled'),
        ],
        string='Status',
        default='approved',
        required=True,
    )
    payment_date = fields.Datetime(
        string='Payment Date',
        default=fields.Datetime.now,
        required=True,
    )

    # Additional payment data
    payer_email = fields.Char(
        string='Payer Email',
    )
    status_detail = fields.Char(
        string='Status Detail',
        help='Payment status detail from MercadoPago',
    )

    # Description
    description = fields.Char(
        string='Description',
        help='Payment description (e.g.: Deposit for Semi-permanent Manicure)',
    )

    _mp_payment_id_unique = models.Constraint(
        'UNIQUE(mp_payment_id)',
        'The MercadoPago Payment ID must be unique',
    )

    @api.model
    def register_payment(self, booking, payment_id, payment_data, payment_type='deposit'):
        """
        Registers a new payment for a booking.

        Args:
            booking: appointment.booking record
            payment_id: MercadoPago payment ID
            payment_data: dict with payment data from MP API
            payment_type: 'deposit', 'additional_deposit', or 'balance'

        Returns:
            appointment.payment record created
        """
        # Check if this payment already exists (deduplication)
        existing = self.search([('mp_payment_id', '=', str(payment_id))], limit=1)
        if existing:
            _logger.info(f'Payment {payment_id} already registered, returning existing')
            return existing

        # Determine payment amount
        amount = payment_data.get('transaction_amount', 0)

        # Determine service_detail: use pending_changes if they exist
        # (for adding service, pending_changes has the combined detail
        #  but hasn't been applied to the booking yet — applied post-payment)
        service_detail = booking.service_detail or booking.service_type
        if booking.pending_changes:
            try:
                changes = json.loads(booking.pending_changes)
                service_detail = changes.get('service_detail', service_detail)
            except (json.JSONDecodeError, TypeError):
                pass

        # Create payment record
        payment = self.create({
            'booking_id': booking.id,
            'mp_payment_id': str(payment_id),
            'mp_preference_id': booking.mp_preference_id,
            'amount': amount,
            'payment_type': payment_type,
            'state': payment_data.get('status', 'approved'),
            'payer_email': payment_data.get('payer', {}).get('email'),
            'status_detail': payment_data.get('status_detail'),
            'description': f'{payment_type.replace("_", " ").title()} - {service_detail}',
        })

        _logger.info(f'Payment {payment_id} registered for booking {booking.id}: ${amount} ({payment_type})')
        return payment
