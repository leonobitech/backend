import sys
from odoo import models

# Aseguramos acceso al patch
PATCH_PATH = "/etc/odoo/patch_fonts.py"
if "/etc/odoo" not in sys.path:
    sys.path.append("/etc/odoo")

try:
    import patch_fonts
except Exception as e:
    print(f"⚠️ Error al aplicar patch_fonts: {e}")

# Esto hace que Odoo sí cargue el módulo
class FixFonts(models.AbstractModel):
    _name = 'fix_fonts.hook'
    _description = 'Hook para forzar carga del patch_fonts'
