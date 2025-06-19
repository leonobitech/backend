# __init__.py de fix_fonts

import sys

# Parchamos justo cuando el servidor arranca
if '/etc/odoo/patch_fonts.py' not in sys.modules:
    exec(open('/etc/odoo/patch_fonts.py').read())
