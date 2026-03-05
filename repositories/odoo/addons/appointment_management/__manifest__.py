{
    'name': 'Appointment Management',
    'version': '19.0.3.0.0',
    'category': 'Services',
    'summary': 'Appointment booking management with MercadoPago payment integration',
    'description': """
        Module for managing appointment bookings with payment integration.

        Features:
        - Appointment booking management with clients
        - MercadoPago integration for deposit collection (30%)
        - REST API for AI agent integration
        - Webhook for automatic payment confirmation
        - Payment history (v2.0): multiple payments per booking

        Changelog v2.0:
        - New appointment.payment model for payment history
        - Support for initial deposit + additional deposits for added services
        - Payment history view in booking form
    """,
    'author': 'Leonobitech',
    'website': 'https://leonobitech.com',
    'license': 'LGPL-3',
    'depends': ['base', 'mail', 'crm'],
    'data': [
        'security/ir.model.access.csv',
        'views/appointment_booking_views.xml',
        'report/recibo_pago_report.xml',
        'report/recibo_pago_template.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
