import logging
import threading
import requests as http_requests
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


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

        # Only trigger for Telegram channels, and only when NOT called from our API
        if self.is_telegram and not self.env.context.get('from_telegram_api'):
            self._forward_manual_reply(message)

        return message

    def _forward_manual_reply(self, message):
        """Send manual reply to n8n webhook so it forwards to Telegram."""
        webhook_url = self.env['ir.config_parameter'].sudo().get_param(
            'salon_messaging.n8n_webhook_url'
        )
        if not webhook_url:
            _logger.warning('salon_messaging.n8n_webhook_url not configured, skipping forward')
            return

        payload = {
            'type': 'manual_reply',
            'telegram_chat_id': self.telegram_chat_id,
            'message': message.body or '',
            'channel_id': self.id,
            'author_name': message.author_id.name if message.author_id else 'Unknown',
        }

        # Fire-and-forget in a thread to avoid blocking the UI
        def _send():
            try:
                resp = http_requests.post(webhook_url, json=payload, timeout=10)
                _logger.info(
                    'Manual reply forwarded to n8n: channel=%s, status=%s',
                    self.id, resp.status_code
                )
            except Exception as e:
                _logger.error('Failed to forward manual reply to n8n: %s', e)

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
            _logger.info('Created Telegram channel %s for chat_id %s', channel.id, chat_id)

        return channel

    @api.model
    def get_or_create_partner(self, name, telegram_username=False):
        """Find or create a res.partner for a Telegram user."""
        Partner = self.env['res.partner'].sudo()

        # Search by telegram ref first
        if telegram_username:
            partner = Partner.search([
                ('ref', '=', f'tg:{telegram_username}'),
            ], limit=1)
            if partner:
                return partner

        # Search by name
        partner = Partner.search([
            ('name', '=', name),
            ('ref', 'like', 'tg:'),
        ], limit=1)

        if not partner:
            partner = Partner.create({
                'name': name,
                'ref': f'tg:{telegram_username}' if telegram_username else f'tg:{name}',
                'comment': 'Created automatically from Telegram',
            })
            _logger.info('Created partner %s for Telegram user %s', partner.id, name)

        return partner
