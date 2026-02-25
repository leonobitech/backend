{
    'name': 'Salón de Turnos - Estilos Leraysi',
    'version': '19.0.3.0.0',
    'category': 'Services',
    'summary': 'Gestión de turnos para salón de belleza con integración Mercado Pago',
    'description': """
        Módulo para gestionar turnos del salón de belleza Estilos Leraysi.

        Características:
        - Gestión de turnos con clientas
        - Integración con Mercado Pago para cobro de señas (30%)
        - API REST para integración con agente AI
        - Webhook para confirmación automática de pagos
        - Historial de pagos (v2.0): múltiples pagos por turno

        Changelog v2.0:
        - Nuevo modelo salon.turno.pago para historial de pagos
        - Soporte para seña inicial + señas adicionales por servicios agregados
        - Vista de historial de pagos en formulario de turno
    """,
    'author': 'Leonobitech',
    'website': 'https://leonobitech.com',
    'license': 'LGPL-3',
    'depends': ['base', 'mail', 'crm'],
    'data': [
        'security/ir.model.access.csv',
        'views/salon_turno_views.xml',
        'report/recibo_pago_report.xml',
        'report/recibo_pago_template.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
