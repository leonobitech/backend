import json
import logging
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class AppointmentAPI(http.Controller):
    """
    REST API for AI agent integration.

    Endpoints:
    - POST /appointment/api/booking - Create new booking
    - GET /appointment/api/booking/<id> - Get booking by ID
    - GET /appointment/api/bookings - Search bookings with filters
    - PUT /appointment/api/booking/<id>/state - Update booking state
    - GET /appointment/api/availability - Check availability

    Required headers:
    - X-API-Key: API key configured in appointment.api_key
    """

    def _check_api_key(self):
        """Verify API key from header"""
        api_key = request.httprequest.headers.get('X-API-Key')
        expected_key = request.env['ir.config_parameter'].sudo().get_param(
            'appointment.api_key'
        )

        if not expected_key:
            _logger.warning('API key not configured in appointment.api_key')
            return True  # Allow if not configured (development)

        if api_key != expected_key:
            return False
        return True

    def _json_response(self, data, status=200):
        """Helper for JSON responses"""
        return Response(
            json.dumps(data, default=str),
            status=status,
            content_type='application/json',
        )

    @http.route(
        '/appointment/api/booking',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def create_booking(self, **kwargs):
        """
        Create a new booking.

        JSON Body:
        {
            "client_name": "Maria Garcia",
            "phone": "+5491112345678",
            "service_type": "haircut",
            "scheduled_datetime": "2025-01-15T10:00:00",
            "total_price": 5000,
            "duration_hours": 1.0,  // optional
            "email": "maria@email.com",  // optional
            "notes": "First time",  // optional
            "generate_payment_link": true  // optional, default true
        }

        Response:
        {
            "success": true,
            "booking": { ... booking data ... }
        }
        """
        if not self._check_api_key():
            return {'success': False, 'error': 'Invalid API key'}

        try:
            data = request.jsonrequest

            booking_model = request.env['appointment.booking'].sudo()
            booking = booking_model.api_create_booking(data)

            return {
                'success': True,
                'booking': booking,
            }

        except Exception as e:
            _logger.error(f'Error creating booking: {e}')
            return {
                'success': False,
                'error': str(e),
            }

    @http.route(
        '/appointment/api/booking/<int:booking_id>',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def get_booking(self, booking_id, **kwargs):
        """
        Get booking by ID.

        Response:
        {
            "success": true,
            "booking": { ... booking data ... }
        }
        """
        if not self._check_api_key():
            return self._json_response({'success': False, 'error': 'Invalid API key'}, 401)

        try:
            booking_model = request.env['appointment.booking'].sudo()
            booking = booking_model.api_get_booking(booking_id)

            if booking:
                return self._json_response({'success': True, 'booking': booking})
            else:
                return self._json_response({'success': False, 'error': 'Booking not found'}, 404)

        except Exception as e:
            _logger.error(f'Error getting booking: {e}')
            return self._json_response({'success': False, 'error': str(e)}, 500)

    @http.route(
        '/appointment/api/bookings',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def search_bookings(self, **kwargs):
        """
        Search bookings with filters.

        Query params:
        - client_name: partial name search
        - phone: exact match
        - date_from: ISO date (2025-01-01)
        - date_to: ISO date (2025-01-31)
        - state: pending_payment, confirmed, completed, cancelled
        - service_type: haircut, coloring, etc.

        Response:
        {
            "success": true,
            "bookings": [ ... list of bookings ... ],
            "total": 10
        }
        """
        if not self._check_api_key():
            return self._json_response({'success': False, 'error': 'Invalid API key'}, 401)

        try:
            filters = {}
            if kwargs.get('client_name'):
                filters['client_name'] = kwargs['client_name']
            if kwargs.get('phone'):
                filters['phone'] = kwargs['phone']
            if kwargs.get('date_from'):
                filters['date_from'] = kwargs['date_from']
            if kwargs.get('date_to'):
                filters['date_to'] = kwargs['date_to']
            if kwargs.get('state'):
                filters['state'] = kwargs['state']
            if kwargs.get('service_type'):
                filters['service_type'] = kwargs['service_type']
            if kwargs.get('worker'):
                filters['worker'] = kwargs['worker']

            booking_model = request.env['appointment.booking'].sudo()
            bookings = booking_model.api_search_bookings(filters)

            return self._json_response({
                'success': True,
                'bookings': bookings,
                'total': len(bookings),
            })

        except Exception as e:
            _logger.error(f'Error searching bookings: {e}')
            return self._json_response({'success': False, 'error': str(e)}, 500)

    @http.route(
        '/appointment/api/booking/<int:booking_id>/state',
        type='jsonrpc',
        auth='none',
        methods=['PUT'],
        csrf=False,
    )
    def update_state(self, booking_id, **kwargs):
        """
        Update booking state.

        JSON Body:
        {
            "state": "confirmed"  // pending_payment, confirmed, completed, cancelled
        }

        Response:
        {
            "success": true,
            "booking": { ... updated data ... }
        }
        """
        if not self._check_api_key():
            return {'success': False, 'error': 'Invalid API key'}

        try:
            data = request.jsonrequest
            new_state = data.get('state')

            if new_state not in ['pending_payment', 'confirmed', 'completed', 'cancelled']:
                return {'success': False, 'error': 'Invalid state'}

            booking = request.env['appointment.booking'].sudo().browse(booking_id)
            if not booking.exists():
                return {'success': False, 'error': 'Booking not found'}

            if new_state == 'confirmed':
                booking.write({'state': 'confirmed', 'deposit_paid': True})
            elif new_state == 'completed':
                booking.action_completar()
            elif new_state == 'cancelled':
                booking.action_cancelar()
            else:
                booking.write({'state': new_state})

            return {
                'success': True,
                'booking': booking._to_dict(),
            }

        except Exception as e:
            _logger.error(f'Error updating state: {e}')
            return {'success': False, 'error': str(e)}

    @http.route(
        '/appointment/api/availability',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def check_availability(self, **kwargs):
        """
        Check schedule availability.

        Query params:
        - date: ISO date (2025-01-15)
        - duration: duration in hours (default 1)

        Response:
        {
            "success": true,
            "date": "2025-01-15",
            "occupied_slots": [
                {"start_time": "10:00", "end_time": "11:00", "service_type": "haircut"}
            ],
            "available_slots": ["09:00", "11:00", "12:00", "14:00", ...]
        }
        """
        if not self._check_api_key():
            return self._json_response({'success': False, 'error': 'Invalid API key'}, 401)

        try:
            from datetime import datetime, time, timedelta

            date_str = kwargs.get('date')
            if not date_str:
                return self._json_response({'success': False, 'error': 'Parameter date is required'}, 400)

            duration = float(kwargs.get('duration', 1))

            # Parse date
            date = datetime.strptime(date_str, '%Y-%m-%d').date()

            # Search bookings for the day (excluding cancelled)
            booking_model = request.env['appointment.booking'].sudo()
            domain = [
                ('scheduled_datetime', '>=', datetime.combine(date, time(0, 0))),
                ('scheduled_datetime', '<', datetime.combine(date + timedelta(days=1), time(0, 0))),
                ('state', '!=', 'cancelled'),
            ]
            if kwargs.get('worker'):
                domain.append(('worker', '=', kwargs['worker']))
            bookings = booking_model.search(domain)

            occupied_slots = []
            for booking in bookings:
                occupied_slots.append({
                    'start_time': booking.scheduled_datetime.strftime('%H:%M'),
                    'end_time': booking.fecha_fin.strftime('%H:%M') if booking.fecha_fin else None,
                    'service_type': booking.service_type,
                    'client_name': booking.client_name,
                    'worker': booking.worker,
                })

            # Calculate available slots (9:00 - 19:00)
            available_slots = []
            opening_hour = 9
            closing_hour = 19

            for hour in range(opening_hour, closing_hour):
                for minute in [0, 30]:  # Every 30 minutes
                    slot_start = datetime.combine(date, time(hour, minute))
                    slot_end = slot_start + timedelta(hours=duration)

                    # Check if slot is free
                    occupied = False
                    for booking in bookings:
                        booking_start = booking.scheduled_datetime.replace(tzinfo=None)
                        booking_end = booking.fecha_fin.replace(tzinfo=None) if booking.fecha_fin else booking_start + timedelta(hours=1)

                        # Check overlap
                        if slot_start < booking_end and slot_end > booking_start:
                            occupied = True
                            break

                    if not occupied and slot_end.hour <= closing_hour:
                        available_slots.append(f'{hour:02d}:{minute:02d}')

            return self._json_response({
                'success': True,
                'date': date_str,
                'occupied_slots': occupied_slots,
                'available_slots': available_slots,
            })

        except Exception as e:
            _logger.error(f'Error checking availability: {e}')
            return self._json_response({'success': False, 'error': str(e)}, 500)

    @http.route(
        '/appointment/api/discuss/channel',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def create_discuss_channel(self, **kwargs):
        """
        Create a Discuss channel for a CRM lead.
        Called when a new lead is registered (WA or TG).
        Channel is named with nick_name initially.

        JSON Body:
        {
            "lead_id": 42,
            "name": "nick_name"
        }

        Response:
        {
            "success": true,
            "channel_id": 10,
            "partner_id": 5
        }
        """
        if not self._check_api_key():
            return {'success': False, 'error': 'Invalid API key'}

        try:
            from odoo import SUPERUSER_ID
            from odoo.api import Environment

            lead_id = kwargs.get('lead_id')
            name = kwargs.get('name', '').strip()

            if not lead_id or not name:
                return {'success': False, 'error': 'lead_id and name are required'}

            env = Environment(request.env.cr, SUPERUSER_ID, {})
            lead = env['crm.lead'].browse(int(lead_id))
            if not lead.exists():
                return {'success': False, 'error': f'Lead {lead_id} not found'}

            # Ensure lead has a partner (contact)
            if not lead.partner_id:
                partner = env['res.partner'].create({
                    'name': name,
                    'phone': lead.phone or '',
                    'email': lead.email_from or '',
                })
                lead.write({'partner_id': partner.id})

            # Create discuss channel
            channel = env['discuss.channel'].create({
                'name': name,
                'channel_type': 'channel',
            })

            # Add lead's partner and OdooBot as members directly
            odoobot_id = env['ir.model.data']._xmlid_to_res_id('base.partner_root')
            env['discuss.channel.member'].create([
                {'channel_id': channel.id, 'partner_id': lead.partner_id.id},
                {'channel_id': channel.id, 'partner_id': odoobot_id},
            ])

            return {
                'success': True,
                'channel_id': channel.id,
                'partner_id': lead.partner_id.id,
            }

        except Exception as e:
            _logger.error(f'Error creating discuss channel: {e}')
            return {'success': False, 'error': str(e)}

    @http.route(
        '/appointment/api/discuss',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def post_discuss_message(self, **kwargs):
        """
        Post a message to the Discuss channel linked to a CRM lead.
        Also syncs contact_name on lead, partner and channel when provided.

        JSON Body:
        {
            "lead_id": 42,
            "text": "message content",
            "author": "user" | "bot",    // optional, default "user"
            "first_name": "Maria",       // optional, shown when author=user
            "contact_name": "Maria Garcia"  // optional, updates lead + discuss channel
        }
        """
        if not self._check_api_key():
            return {'success': False, 'error': 'Invalid API key'}

        try:
            from markupsafe import Markup
            from odoo import SUPERUSER_ID
            from odoo.api import Environment

            lead_id = kwargs.get('lead_id')
            text = kwargs.get('text', '').strip()
            author = kwargs.get('author', 'user')
            first_name = kwargs.get('first_name', '')
            contact_name = kwargs.get('contact_name', '').strip()

            if not lead_id or not text:
                return {'success': False, 'error': 'lead_id and text are required'}

            env = Environment(request.env.cr, SUPERUSER_ID, {})
            lead = env['crm.lead'].browse(int(lead_id))
            if not lead.exists():
                return {'success': False, 'error': f'Lead {lead_id} not found'}

            if not lead.partner_id:
                return {'success': False, 'error': 'Lead has no partner. Create channel first.'}

            # Find the Discuss channel where lead's partner is a member
            channel = env['discuss.channel'].search([
                ('channel_member_ids.partner_id', '=', lead.partner_id.id),
                ('channel_type', '=', 'channel'),
            ], limit=1)

            if not channel:
                return {'success': False, 'error': 'No Discuss channel found for this lead'}

            # Sync contact name on lead, partner and channel
            name_to_sync = contact_name or first_name
            if author == 'user' and name_to_sync:
                if lead.contact_name != name_to_sync:
                    lead.write({'contact_name': name_to_sync})
                if lead.partner_id.name != name_to_sync:
                    lead.partner_id.write({'name': name_to_sync})
                if channel.name != name_to_sync:
                    channel.write({'name': name_to_sync})

            # Build message body
            if author == 'bot':
                body = Markup(text)
            else:
                label = f'👤 <strong>{first_name}:</strong>' if first_name else '👤'
                body = Markup(f'<p>{label} {text}</p>')

            # Post to the Discuss channel (not to the lead's chatter)
            author_id = lead.partner_id.id if author == 'user' else env['ir.model.data']._xmlid_to_res_id('base.partner_root')
            channel.message_post(
                body=body,
                message_type='comment',
                subtype_xmlid='mail.mt_comment',
                author_id=author_id,
            )
            return {'success': True, 'channel_id': channel.id}

        except Exception as e:
            _logger.error(f'Error posting discuss message: {e}')
            return {'success': False, 'error': str(e)}

    @http.route(
        '/appointment/api/services',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def list_services(self, **kwargs):
        """
        List available services.

        Response:
        {
            "success": true,
            "services": [
                {"code": "haircut", "name": "Haircut"},
                {"code": "coloring", "name": "Coloring"},
                ...
            ]
        }
        """
        services = [
            {'code': 'corte', 'name': 'Corte'},
            {'code': 'tintura', 'name': 'Tintura'},
            {'code': 'mechas', 'name': 'Mechas'},
            {'code': 'brushing', 'name': 'Brushing'},
            {'code': 'peinado', 'name': 'Peinado'},
            {'code': 'tratamiento', 'name': 'Tratamiento Capilar'},
            {'code': 'manicura', 'name': 'Manicura'},
            {'code': 'pedicura', 'name': 'Pedicura'},
            {'code': 'depilacion', 'name': 'Depilacion'},
            {'code': 'maquillaje', 'name': 'Maquillaje'},
            {'code': 'otro', 'name': 'Otro'},
        ]

        return self._json_response({
            'success': True,
            'services': services,
        })
