import json
import logging
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class SalonMessagingAPI(http.Controller):
    """
    REST API for n8n to bridge Telegram messages into Odoo Discuss.

    Endpoints:
    - POST /salon_messaging/receive       — Post incoming Telegram message to Discuss
    - POST /salon_messaging/bot_response  — Post bot AI response to Discuss
    - GET  /salon_messaging/channels      — List active Telegram channels

    Headers:
    - X-API-Key: API key from ir.config_parameter salon_messaging.api_key
    """

    def _check_api_key(self):
        api_key = request.httprequest.headers.get('X-API-Key')
        expected_key = request.env['ir.config_parameter'].sudo().get_param(
            'salon_messaging.api_key'
        )
        if not expected_key:
            _logger.warning('salon_messaging.api_key not configured — allowing access')
            return True
        return api_key == expected_key

    def _json_response(self, data, status=200):
        return Response(
            json.dumps(data, default=str),
            status=status,
            content_type='application/json',
        )

    # ─────────────────────────────────────────────
    # POST /salon_messaging/receive
    # n8n sends incoming Telegram user message
    # ─────────────────────────────────────────────
    @http.route(
        '/salon_messaging/receive',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def receive_message(self, chat_id=None, first_name='Unknown', username='', text='', lead_id=None, **kwargs):
        """Receive a Telegram message from n8n and post it to Discuss.
        Params arrive as kwargs via JSON-RPC (Odoo 19)."""
        if not self._check_api_key():
            return {'success': False, 'error': 'Invalid API key'}

        try:
            if not chat_id:
                return {'success': False, 'error': 'chat_id is required'}

            ChannelModel = request.env['discuss.channel'].sudo()

            # Get or create channel
            channel = ChannelModel.get_or_create_telegram_channel(
                chat_id, first_name, username
            )

            # Get or create partner for the sender
            partner = ChannelModel.get_or_create_partner(first_name, username)

            # Link to CRM lead if provided
            if lead_id and not channel.lead_id:
                lead = request.env['crm.lead'].sudo().browse(int(lead_id))
                if lead.exists():
                    channel.lead_id = lead.id

            # Post message to Discuss channel (with context flag to skip webhook loop)
            message = channel.with_context(from_telegram_api=True).message_post(
                body=text,
                author_id=partner.id,
                message_type='comment',
                subtype_xmlid='mail.mt_comment',
            )

            _logger.info(
                'Telegram message posted: channel=%s, partner=%s, msg=%s',
                channel.id, partner.id, message.id
            )

            return {
                'success': True,
                'channel_id': channel.id,
                'message_id': message.id,
                'partner_id': partner.id,
            }

        except Exception as e:
            _logger.error('Error receiving Telegram message: %s', e)
            return {'success': False, 'error': str(e)}

    # ─────────────────────────────────────────────
    # POST /salon_messaging/bot_response
    # n8n sends AI bot response
    # ─────────────────────────────────────────────
    @http.route(
        '/salon_messaging/bot_response',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def bot_response(self, chat_id=None, text='', **kwargs):
        """Post the bot's AI response to Discuss so Felix sees full conversation.
        Params arrive as kwargs via JSON-RPC (Odoo 19)."""
        if not self._check_api_key():
            return {'success': False, 'error': 'Invalid API key'}

        try:
            if not chat_id:
                return {'success': False, 'error': 'chat_id is required'}

            ChannelModel = request.env['discuss.channel'].sudo()

            channel = ChannelModel.sudo().search([
                ('telegram_chat_id', '=', str(chat_id)),
                ('is_telegram', '=', True),
            ], limit=1)

            if not channel:
                return {'success': False, 'error': f'No channel for chat_id {chat_id}'}

            # Get or create bot partner
            bot_partner = self._get_bot_partner()

            message = channel.with_context(from_telegram_api=True).message_post(
                body=text,
                author_id=bot_partner.id,
                message_type='comment',
                subtype_xmlid='mail.mt_comment',
            )

            return {
                'success': True,
                'channel_id': channel.id,
                'message_id': message.id,
            }

        except Exception as e:
            _logger.error('Error posting bot response: %s', e)
            return {'success': False, 'error': str(e)}

    def _get_bot_partner(self):
        """Get or create the bot partner used as author for bot messages."""
        Partner = request.env['res.partner'].sudo()
        bot = Partner.search([('ref', '=', 'tg:leraysi_bot')], limit=1)
        if not bot:
            bot = Partner.create({
                'name': 'Lera Bot',
                'ref': 'tg:leraysi_bot',
                'comment': 'Telegram bot partner for Discuss messages',
            })
        return bot

    # ─────────────────────────────────────────────
    # GET /salon_messaging/channels
    # Debug: list active Telegram channels
    # ─────────────────────────────────────────────
    @http.route(
        '/salon_messaging/channels',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def list_channels(self, **kwargs):
        """List active Telegram channels (debug endpoint)."""
        if not self._check_api_key():
            return self._json_response({'success': False, 'error': 'Invalid API key'}, 403)

        channels = request.env['discuss.channel'].sudo().search([
            ('is_telegram', '=', True),
        ])

        result = []
        for ch in channels:
            result.append({
                'id': ch.id,
                'name': ch.name,
                'telegram_chat_id': ch.telegram_chat_id,
                'telegram_username': ch.telegram_username,
                'lead_id': ch.lead_id.id if ch.lead_id else None,
                'message_count': len(ch.message_ids),
            })

        return self._json_response({'success': True, 'channels': result})
