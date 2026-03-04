import logging
from odoo import models, api

_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def write(self, vals):
        res = super().write(vals)
        if 'name' in vals:
            for partner in self:
                if partner.ref and partner.ref.startswith('tg:'):
                    chat_id = partner.ref.replace('tg:', '')
                    channel = self.env['discuss.channel'].sudo().search([
                        ('telegram_chat_id', '=', chat_id),
                        ('is_telegram', '=', True),
                    ], limit=1)
                    if channel:
                        channel.name = f'TG: {vals["name"]}'
                        _logger.info(
                            'Updated Discuss channel %s name to TG: %s',
                            channel.id, vals['name'],
                        )
        return res
