{
    'name': 'Salon Messaging - Telegram via Discuss',
    'version': '19.0.1.0.0',
    'category': 'Services',
    'summary': 'Bridge Telegram conversations into Odoo Discuss via n8n',
    'description': """
        Lightweight addon that bridges Telegram bot conversations into
        Odoo Discuss channels. n8n is the central orchestrator.

        Features:
        - Extend discuss.channel with Telegram metadata
        - REST API endpoints for n8n to post messages
        - Automated action to detect manual replies and forward to n8n
        - Link conversations to CRM leads
    """,
    'author': 'Leonobitech',
    'website': 'https://leonobitech.com',
    'license': 'LGPL-3',
    'depends': ['base', 'mail', 'crm'],
    'data': [
        'security/ir.model.access.csv',
        'data/automated_action.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
