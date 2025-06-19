import sys
import logging
from odoo import models

_logger = logging.getLogger(__name__)

# Aseguramos acceso al patch
PATCH_DIR = "/etc/odoo"
if PATCH_DIR not in sys.path:
    sys.path.append(PATCH_DIR)

try:
    import patch_fonts
    _logger.info("✅ patch_fonts.py importado correctamente")
except Exception as e:
    _logger.warning(f"⚠️ No se pudo importar patch_fonts: {e}")

# Hook fantasma para asegurar que Odoo cargue el módulo
class FixFonts(models.AbstractModel):
    _name = 'fix_fonts.hook'
    _description = 'Hook para forzar carga del patch_fonts'
