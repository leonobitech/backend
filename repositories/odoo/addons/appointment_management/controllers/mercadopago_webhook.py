import json
import logging
import hmac
import hashlib
import requests
from datetime import datetime, timezone, timedelta
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class MercadoPagoWebhook(http.Controller):
    """
    Webhook for receiving MercadoPago notifications.

    IMPORTANT: Only Webhook V2 notifications are accepted.
    - V2 uses query params: ?data.id=xxx&type=xxx
    - Legacy IPN (?id=xxx&topic=xxx) is REJECTED

    Security:
    - Primary verification: query MercadoPago API to validate the payment
    - HMAC-SHA256 verification (optional, logging only - see TODO in code)

    Endpoints:
    - POST /appointment/webhook/mercadopago - Main webhook (V2 only)
    - GET /appointment/payment/success - Payment success page
    - GET /appointment/payment/error - Payment error page
    - GET /appointment/payment/pending - Payment pending page
    """

    def _verify_signature_v2(self, x_signature, x_request_id, data_id):
        """
        Verify webhook V2 signature from MercadoPago using HMAC-SHA256.

        Manifest format: id:{data.id};request-id:{x_request_id};ts:{ts};

        Args:
            x_signature: Header x-signature with format "ts=xxx,v1=xxx"
            x_request_id: Header x-request-id
            data_id: Value of data.id from query param

        Returns:
            tuple: (is_valid: bool, error_message: str or None)
        """
        webhook_secret = request.env['ir.config_parameter'].sudo().get_param(
            'appointment.mp_webhook_secret'
        )

        if not webhook_secret:
            return False, 'Webhook secret not configured'

        webhook_secret = webhook_secret.strip()

        # Parse x_signature: ts=xxx,v1=xxx
        parts = {}
        try:
            for part in x_signature.split(','):
                if '=' in part:
                    key, value = part.split('=', 1)
                    parts[key.strip()] = value.strip()
        except Exception as e:
            return False, f'Invalid x-signature format: {e}'

        ts = parts.get('ts')
        v1 = parts.get('v1')

        if not ts or not v1:
            return False, 'Incomplete signature (missing ts or v1)'

        # Format documented by MercadoPago
        manifest = f'id:{data_id};request-id:{x_request_id};ts:{ts};'

        calculated = hmac.new(
            webhook_secret.encode('utf-8'),
            manifest.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        if hmac.compare_digest(calculated, v1):
            return True, None
        else:
            return False, 'Signature mismatch'

    @http.route(
        '/appointment/webhook/mercadopago',
        type='http',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def webhook_mercadopago(self, **kwargs):
        """
        Receive MercadoPago notifications (WEBHOOK V2 ONLY).

        Expected V2 format:
        - Query params: ?data.id=123&type=payment
        - Headers: x-signature, x-request-id

        Legacy IPN format (REJECTED):
        - Query params: ?id=123&topic=payment
        """
        try:
            _logger.info(f'[MP Webhook] Notification received: type={kwargs.get("type")}, data.id={kwargs.get("data.id")}')

            # =========================================================
            # STEP 1: Detect and REJECT legacy IPN format
            # =========================================================
            is_ipn_format = kwargs.get('topic') is not None or (
                kwargs.get('id') is not None and kwargs.get('data.id') is None
            )

            if is_ipn_format:
                _logger.warning(f'[MP Webhook] REJECTED: Legacy IPN format detected (id={kwargs.get("id")}, topic={kwargs.get("topic")})')
                _logger.warning(f'[MP Webhook] Configure webhook V2 in MercadoPago dashboard')
                return Response(
                    json.dumps({
                        'status': 'error',
                        'message': 'IPN legacy format not supported. Use Webhook V2 (?data.id=xxx&type=xxx)'
                    }),
                    content_type='application/json',
                    status=400
                )

            # =========================================================
            # STEP 2: Validate V2 format
            # =========================================================
            data_id = kwargs.get('data.id')
            notification_type = kwargs.get('type')

            if not data_id or not notification_type:
                _logger.warning(f'[MP Webhook] REJECTED: Missing V2 params (data.id={data_id}, type={notification_type})')
                return Response(
                    json.dumps({
                        'status': 'error',
                        'message': 'Missing required V2 params: data.id and type'
                    }),
                    content_type='application/json',
                    status=400
                )

            _logger.info(f'[MP Webhook] V2 detected: data.id={data_id}, type={notification_type}')

            # =========================================================
            # STEP 3: HMAC-SHA256 signature verification (optional)
            # =========================================================
            # TODO: Signature verification works with "Simulate notification"
            # from the MP dashboard, but fails with real payments.
            #
            # Hypothesis: The issue comes from how Odoo processes the request
            # in the addon context (not Cloudflare/Traefik).
            # Investigate: werkzeug request parsing, Odoo http middleware.
            #
            # For now: log result but do not block.
            # Security guaranteed by MP API verification in STEP 4.
            # =========================================================
            x_signature = request.httprequest.headers.get('x-signature')
            x_request_id = request.httprequest.headers.get('x-request-id')

            if x_signature and x_request_id:
                is_valid, error = self._verify_signature_v2(x_signature, x_request_id, data_id)
                if is_valid:
                    _logger.info('[MP Webhook] HMAC signature verified successfully')
                else:
                    _logger.warning(f'[MP Webhook] HMAC signature mismatch: {error} (continuing with API verification)')
            else:
                _logger.debug('[MP Webhook] Signature headers not present')

            # =========================================================
            # STEP 4: Process notification by type
            # =========================================================
            # Normalize data for internal processing
            data = {
                'type': notification_type,
                'data': {'id': data_id},
                'action': kwargs.get('action'),
            }

            # Try to read JSON body if present (MP sometimes sends action in body)
            content_type = request.httprequest.content_type or ''
            if 'application/json' in content_type:
                try:
                    body_data = json.loads(request.httprequest.data.decode('utf-8'))
                    if body_data.get('action'):
                        data['action'] = body_data.get('action')
                except Exception:
                    pass

            if notification_type == 'payment':
                result = self._process_payment_notification(data)
            elif notification_type == 'merchant_order':
                result = self._process_merchant_order(data)
            else:
                _logger.info(f'[MP Webhook] Unhandled notification type: {notification_type}')
                result = {'status': 'ok', 'message': f'Notification type {notification_type} not handled'}

            _logger.info(f'[MP Webhook] Processed: {result.get("status", "unknown")}')

            return Response(
                json.dumps(result),
                content_type='application/json',
                status=200
            )

        except Exception as e:
            _logger.error(f'[MP Webhook] CRITICAL ERROR: {e}', exc_info=True)
            # ALWAYS return 200 to prevent MercadoPago retry loop.
            # MP retries on non-200, which causes infinite loops when
            # concurrent requests hit SerializationFailure errors.
            return Response(
                json.dumps({'status': 'error', 'message': str(e)}),
                content_type='application/json',
                status=200
            )

    def _process_payment_notification(self, data):
        """Process payment notification"""
        payment_id = data.get('data', {}).get('id')

        if not payment_id:
            return {'status': 'error', 'message': 'No payment ID'}

        # Get payment details from MP
        mp_access_token = request.env['ir.config_parameter'].sudo().get_param(
            'appointment.mp_access_token'
        )

        if not mp_access_token:
            _logger.error('MP access token not configured')
            return {'status': 'error', 'message': 'MP not configured'}

        try:
            response = requests.get(
                f'https://api.mercadopago.com/v1/payments/{payment_id}',
                headers={'Authorization': f'Bearer {mp_access_token}'},
                timeout=30,
            )
            response.raise_for_status()
            payment_data = response.json()

            _logger.info(f'[MP Webhook] Payment {payment_id}: status={payment_data.get("status")}, external_ref={payment_data.get("external_reference")}')

            # Get external reference (booking ID)
            external_reference = payment_data.get('external_reference')
            status = payment_data.get('status')

            if not external_reference:
                _logger.warning('Payment without external_reference')
                return {'status': 'ok', 'message': 'No external reference'}

            # Use sudo with admin user (SUPERUSER_ID = 1) to avoid singleton error
            # Important: auth='none' has no user, we need a valid one for write_uid
            BookingModel = request.env['appointment.booking'].with_user(1).sudo()

            # Find booking
            booking = BookingModel.browse(int(external_reference))

            if not booking.exists():
                _logger.warning(f'Booking {external_reference} not found')
                return {'status': 'error', 'message': 'Booking not found'}

            # =========================================================
            # ROW LOCKING: Serialize concurrent access to the booking
            # =========================================================
            # MercadoPago can send duplicate notifications in parallel.
            # FOR UPDATE blocks until another transaction on this row
            # commits, ensuring the deduplication check sees
            # already-confirmed records.
            request.env.cr.execute(
                "SELECT id FROM appointment_booking WHERE id = %s FOR UPDATE",
                [booking.id]
            )

            # Deduplication: check if we already processed this payment in history
            PaymentModel = request.env['appointment.payment'].with_user(1).sudo()
            existing_payment = PaymentModel.search([('mp_payment_id', '=', str(payment_id))], limit=1)
            if existing_payment:
                _logger.info(f'Payment {payment_id} already registered in history, ignoring duplicate')
                return {'status': 'ok', 'message': 'Already processed'}

            # Guard: reject payments for cancelled/expired bookings
            if booking.state == 'cancelled':
                _logger.warning(
                    f'[MP Webhook] Payment {payment_id} for CANCELLED booking {booking.id}, '
                    f'ignoring (old link without expiration). Manual refund may be required.'
                )
                booking.message_post(
                    body=f'Warning: A payment (MP #{payment_id}) was received but the booking was already cancelled. '
                         f'Check if a refund is needed.'
                )
                return {'status': 'ok', 'message': 'Booking cancelled, payment ignored'}

            # Update based on payment status
            if status == 'approved':
                # Determine payment type (initial deposit or additional)
                payment_type = 'deposit' if booking.cantidad_pagos == 0 else 'additional_deposit'

                # Register payment in history
                PaymentModel.register_payment(booking, payment_id, payment_data, tipo=payment_type)

                # Update booking (mp_payment_id keeps the latest for compatibility)
                booking.write({
                    'deposit_paid': True,
                    'state': 'confirmed',
                    'mp_payment_id': str(payment_id),
                })

                # Apply pending changes if they exist (service added post-payment)
                # pending_changes contains the definitive fields (service, price,
                # duration, complexity) that were saved as staging when adding
                # a service, and are applied here only when payment is confirmed.
                if booking.pending_changes:
                    booking.action_aplicar_pending_changes()

                amount = payment_data.get('transaction_amount', 0)
                booking.message_post(
                    body=f'Deposit payment confirmed via MercadoPago. '
                         f'Payment ID: {payment_id} - Amount: ${amount:,.0f} ({payment_type})'
                )
                _logger.info(f'Booking {booking.id} confirmed by MP payment {payment_id} - ${amount} ({payment_type})')

                # =========================================================
                # COMMIT: Release the row lock BEFORE external calls
                # =========================================================
                # The FOR UPDATE holds the lock until the transaction
                # commits. If we call the MCP without committing first,
                # the MCP tries appointment.booking.write via xmlrpc (another connection)
                # and gets blocked by our lock -> timeout/deadlock.
                #
                # Commit here is safe because:
                # 1. Payment already registered -> dedup protects from duplicates
                # 2. Booking already updated to 'confirmed'
                # 3. MCP and n8n are "fire and forget" (no rollback needed)
                request.env.cr.commit()

                # Force ORM re-read after commit.
                # action_aplicar_pending_changes() did write() within the same
                # transaction. After commit the data is in DB, but the Python
                # recordset may have cached values (e.g.: max_complexity
                # pre-pending_changes). Without invalidate, the webhook payload
                # sends the old value to n8n/Baserow.
                booking.invalidate_recordset()

                # Call MCP to execute the full confirmation process
                # (contact, invoice, calendar, email with PDF)
                mcp_result = self._call_mcp_confirm_payment(booking, payment_id)

                # Notify n8n for the rest of the flow (Baserow, WhatsApp)
                # Includes enriched data from MCP if available
                self._notify_n8n_payment_confirmed(booking, payment_id, payment_data, mcp_result)

            elif status in ['pending', 'in_process']:
                booking.message_post(
                    body=f'Payment pending in MercadoPago. Payment ID: {payment_id}'
                )

            elif status in ['rejected', 'cancelled']:
                booking.message_post(
                    body=f'Payment rejected/cancelled in MercadoPago. '
                         f'Payment ID: {payment_id}, Status: {status}'
                )

            return {'status': 'ok', 'message': f'Payment {status}'}

        except requests.exceptions.RequestException as e:
            _logger.error(f'Error querying payment from MP: {e}')
            return {'status': 'error', 'message': str(e)}

    def _process_merchant_order(self, data):
        """Process merchant order notification"""
        # Similar to payment but for orders
        _logger.info('Merchant order notification received')
        return {'status': 'ok', 'message': 'Merchant order processed'}

    def _call_mcp_confirm_payment(self, booking, payment_id):
        """
        Call MCP server to execute the full confirmation process.

        The MCP executes:
        - Create contact in res.partner (if it doesn't exist)
        - Link contact to Lead
        - Move Lead to "Qualified"
        - Create calendar event
        - Create invoice
        - Generate invoice PDF
        - Send email with PDF attachment

        Args:
            booking: booking record
            payment_id: MercadoPago payment ID

        Returns:
            dict with MCP result or None if failed/not configured
        """
        mcp_url = request.env['ir.config_parameter'].sudo().get_param(
            'appointment.mcp_url'
        )
        mcp_token = request.env['ir.config_parameter'].sudo().get_param(
            'appointment.mcp_service_token'
        )

        if not mcp_url:
            _logger.warning('[MCP] URL not configured, skipping MCP process')
            return None

        if not mcp_token:
            _logger.warning('[MCP] Service token not configured, skipping MCP process')
            return None

        # Verify booking has lead_id
        lead_id = booking.lead_id.id if booking.lead_id else None

        if not lead_id:
            _logger.warning(f'[MCP] Booking {booking.id} has no associated lead_id, skipping MCP process')
            return None

        try:
            payload = {
                'tool': 'appointment_confirm_payment',
                'arguments': {
                    'turno_id': booking.id,
                    'mp_payment_id': str(payment_id),
                    'lead_id': lead_id,
                }
            }

            # Add email_override if the booking has email
            if booking.email:
                payload['arguments']['email_override'] = booking.email

            _logger.info(f'[MCP] Calling appointment_confirm_payment for booking {booking.id}')

            response = requests.post(
                f'{mcp_url}/internal/mcp/call-tool',
                json=payload,
                headers={
                    'Content-Type': 'application/json',
                    'X-Service-Token': mcp_token,
                },
                timeout=60,  # Longer timeout because the process is comprehensive
            )

            if response.ok:
                result = response.json()
                _logger.info(f'[MCP] Process completed for booking {booking.id}: {result.get("success", False)}')
                return result
            else:
                _logger.error(f'[MCP] Error: {response.status_code} - {response.text}')
                return None

        except requests.exceptions.Timeout:
            _logger.error(f'[MCP] Timeout processing booking {booking.id}')
            return None
        except requests.exceptions.RequestException as e:
            _logger.error(f'[MCP] Connection error: {e}')
            return None
        except Exception as e:
            _logger.error(f'[MCP] Unexpected error: {e}', exc_info=True)
            return None

    def _notify_n8n_payment_confirmed(self, booking, payment_id, payment_data, mcp_result=None):
        """
        Notify n8n that the payment was confirmed.

        n8n handles:
        - Update Baserow (booking + lead)
        - Send WhatsApp

        Note: The MCP already handled:
        - Create contact (res.partner)
        - Create invoice (account.move)
        - Create calendar event
        - Send email with PDF

        This call is "fire and forget" - if it fails, the payment is already registered
        in Odoo and the enrichment can be retried later.

        Args:
            booking: booking record
            payment_id: MP payment ID
            payment_data: payment data from MP API
            mcp_result: MCP result (optional, for enriched data)
        """
        n8n_webhook_url = request.env['ir.config_parameter'].sudo().get_param(
            'appointment.n8n_webhook_url'
        )
        n8n_webhook_secret = request.env['ir.config_parameter'].sudo().get_param(
            'appointment.n8n_webhook_secret'
        )

        if not n8n_webhook_url:
            _logger.warning('n8n webhook URL not configured, skipping notification')
            return

        try:
            # Prepare booking data for n8n
            # Argentina timezone (UTC-3)
            argentina_tz = timezone(timedelta(hours=-3))
            confirmed_at = datetime.now(argentina_tz).isoformat()

            booking_data = {
                'event': 'payment_confirmed',
                'booking': {
                    'id': booking.id,
                    'client_name': booking.client_name,
                    'phone': booking.phone,
                    'email': booking.email,
                    'service_type': booking.service_type,
                    'service_detail': booking.service_detail,
                    'scheduled_datetime': booking.scheduled_datetime.isoformat() if booking.scheduled_datetime else None,
                    # local_time: explicit UTC->AR conversion to avoid ambiguity
                    # booking.scheduled_datetime is naive UTC in the Odoo ORM
                    'local_time': (booking.scheduled_datetime - timedelta(hours=3)).strftime('%H:%M') if booking.scheduled_datetime else None,
                    'duration_hours': booking.duration_hours,
                    'duration_min': int(booking.duration_hours * 60) if booking.duration_hours else 60,
                    'max_complexity': booking.max_complexity or 'media',
                    'total_price': booking.total_price,
                    'deposit_amount': booking.deposit_amount,
                    'pending_payment_amount': booking.pending_payment_amount,
                    'remaining_amount': booking.remaining_amount,
                    'state': booking.state,  # Already updated to 'confirmed'
                    'mp_preference_id': booking.mp_preference_id,  # For Baserow lookup
                    'lead_id': booking.lead_id.id if booking.lead_id else None,
                },
                'payment': {
                    'mp_payment_id': str(payment_id),
                    'mp_preference_id': booking.mp_preference_id,  # Duplicated for easy access
                    'status': payment_data.get('status'),
                    'status_detail': payment_data.get('status_detail'),
                    'payer_email': payment_data.get('payer', {}).get('email'),
                    'confirmed_at': confirmed_at,
                },
                # Enriched data from MCP (if available)
                'mcp': mcp_result if mcp_result else None,
            }

            # Headers with authentication
            headers = {'Content-Type': 'application/json'}
            if n8n_webhook_secret:
                headers['X-Webhook-Secret'] = n8n_webhook_secret

            # Async-style call (short timeout, we don't wait for response)
            response = requests.post(
                n8n_webhook_url,
                json=booking_data,
                headers=headers,
                timeout=5,  # Short timeout - fire and forget
            )

            if response.ok:
                _logger.info(f'n8n notified successfully for booking {booking.id}')
            else:
                _logger.warning(
                    f'n8n responded with error: {response.status_code} - {response.text}'
                )

        except requests.exceptions.Timeout:
            _logger.warning(f'Timeout notifying n8n for booking {booking.id}')
        except requests.exceptions.RequestException as e:
            _logger.error(f'Error notifying n8n: {e}')

    @http.route(
        '/appointment/payment/success',
        type='http',
        auth='public',
        methods=['GET'],
        csrf=False,
    )
    def payment_success(self, **kwargs):
        """Payment success page"""
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Successful</title>
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
                <div class="icon">&#10004;</div>
                <h1>Payment Successful!</h1>
                <p>Your deposit has been processed successfully.</p>
                <div class="details">
                    <strong>Your appointment is confirmed</strong><br>
                    We will send you a reminder before your appointment.
                </div>
            </div>
        </body>
        </html>
        """
        return Response(html, content_type='text/html')

    @http.route(
        '/appointment/payment/error',
        type='http',
        auth='public',
        methods=['GET'],
        csrf=False,
    )
    def payment_error(self, **kwargs):
        """Payment error page"""
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Error</title>
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
                <div class="icon">&#10060;</div>
                <h1>Payment Error</h1>
                <p>We could not process your payment. Please try again or contact us.</p>
            </div>
        </body>
        </html>
        """
        return Response(html, content_type='text/html')

    @http.route(
        '/appointment/payment/pending',
        type='http',
        auth='public',
        methods=['GET'],
        csrf=False,
    )
    def payment_pending(self, **kwargs):
        """Payment pending page"""
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Pending</title>
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
                <div class="icon">&#9203;</div>
                <h1>Payment Pending</h1>
                <p>Your payment is being processed.</p>
                <div class="details">
                    <strong>We will notify you when it is confirmed</strong><br>
                    This may take a few minutes.
                </div>
            </div>
        </body>
        </html>
        """
        return Response(html, content_type='text/html')
