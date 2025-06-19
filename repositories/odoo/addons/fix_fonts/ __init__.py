# __init__.py
import sys

# Asegúrate que el patch está accesible
PATCH_PATH = "/etc/odoo/patch_fonts.py"
if PATCH_PATH not in sys.path:
    sys.path.append("/etc/odoo")

try:
    import patch_fonts
except Exception as e:
    print(f"⚠️ Error al aplicar patch_fonts: {e}")
