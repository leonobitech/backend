import logging
import re
import threading
import requests as http_requests
from odoo import models, fields, api

_logger = logging.getLogger(__name__)

TELEGRAM_API_URL = 'https://api.telegram.org/bot{token}/sendMessage'


class DiscussChannel(models.Model):
    _inherit = 'discuss.channel'

    telegram_chat_id = fields.Char('Telegram Chat ID', index=True)
    telegram_username = fields.Char('Telegram Username')
    telegram_first_name = fields.Char('Telegram First Name')
    is_telegram = fields.Boolean('Es canal Telegram', default=False)
    lead_id = fields.Many2one('crm.lead', string='Lead CRM')

    def message_post(self, **kwargs):
        """Override to detect manual replies in Telegram channels."""
        message = super().message_post(**kwargs)

        # Only forward if ALL conditions met:
        # 1. Telegram channel
        # 2. NOT called from our API (context flag)
        # 3. Author is a real user, NOT a tg: partner or system
        # 4. Has actual body content (not a system notification)
        if (self.is_telegram
                and not self.env.context.get('from_telegram_api')
                and message.body
                and message.author_id
                and not (message.author_id.ref or '').startswith('tg:')
                and message.message_type == 'comment'):
            self._forward_manual_reply(message)

        return message

    def _forward_manual_reply(self, message):
        """Send manual reply directly to Telegram via Bot API."""
        bot_token = self.env['ir.config_parameter'].sudo().get_param(
            'salon_messaging.telegram_bot_token'
        )
        if not bot_token:
            _logger.warning('salon_messaging.telegram_bot_token not configured, skipping forward')
            return

        # Strip HTML tags from Odoo message body
        plain_text = re.sub(r'<[^>]*>', '', message.body or '')
        plain_text = plain_text.replace('&nbsp;', ' ').replace('&amp;', '&')
        plain_text = plain_text.replace('&lt;', '<').replace('&gt;', '>').strip()

        if not plain_text:
            return

        chat_id = self.telegram_chat_id
        url = TELEGRAM_API_URL.format(token=bot_token)
        payload = {
            'chat_id': chat_id,
            'text': plain_text,
        }

        # Fire-and-forget in a thread to avoid blocking the UI
        def _send():
            try:
                resp = http_requests.post(url, json=payload, timeout=10)
                _logger.info(
                    'Manual reply sent to Telegram: channel=%s, chat_id=%s, status=%s',
                    self.id, chat_id, resp.status_code
                )
            except Exception as e:
                _logger.error('Failed to send manual reply to Telegram: %s', e)

        thread = threading.Thread(target=_send)
        thread.daemon = True
        thread.start()

    @api.model
    def get_or_create_telegram_channel(self, chat_id, name, username=False):
        """Find or create a Discuss channel for a Telegram chat."""
        channel = self.sudo().search([
            ('telegram_chat_id', '=', str(chat_id)),
            ('is_telegram', '=', True),
        ], limit=1)

        if not channel:
            channel = self.sudo().create({
                'name': f'TG: {name}',
                'channel_type': 'channel',
                'telegram_chat_id': str(chat_id),
                'telegram_username': username or '',
                'telegram_first_name': name,
                'is_telegram': True,
            })
            # Add all internal users as channel members so they see it in Discuss
            internal_partners = self.env['res.users'].sudo().search([
                ('share', '=', False),
            ]).mapped('partner_id')
            if internal_partners:
                channel.add_members(internal_partners.ids)
            _logger.info('Created Telegram channel %s for chat_id %s', channel.id, chat_id)

        return channel

    @api.model
    def get_or_create_partner(self, name, chat_id, telegram_username=False):
        """Find or create a res.partner for a Telegram user.
        Uses chat_id as stable ref to avoid duplicates when name changes."""
        Partner = self.env['res.partner'].sudo()

        # Search by chat_id ref (stable, never changes)
        partner = Partner.search([
            ('ref', '=', f'tg:{chat_id}'),
        ], limit=1)

        if not partner:
            partner = Partner.create({
                'name': name,
                'ref': f'tg:{chat_id}',
                'comment': 'Created automatically from Telegram',
            })
            _logger.info('Created partner %s (chat_id=%s) for Telegram user %s', partner.id, chat_id, name)

        return partner
