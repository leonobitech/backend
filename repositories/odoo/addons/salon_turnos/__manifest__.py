{
    'name': 'Salón de Turnos - Estilos Leraysi',
    'version': '19.0.1.0.0',
    'category': 'Services',
    'summary': 'Gestión de turnos para salón de belleza con integración Mercado Pago',
    'description': """
        Módulo para gestionar turnos del salón de belleza Estilos Leraysi.

        Características:
        - Gestión de turnos con clientas
        - Integración con Mercado Pago para cobro de señas (30%)
        - API REST para integración con agente AI
        - Webhook para confirmación automática de pagos
    """,
    'author': 'Leonobitech',
    'website': 'https://leonobitech.com',
    'license': 'LGPL-3',
    'depends': ['base', 'mail'],
    'data': [
        'security/ir.model.access.csv',
        'views/salon_turno_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
