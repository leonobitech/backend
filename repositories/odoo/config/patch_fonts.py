# patch_fonts.py

from reportlab.pdfbase import _fontdata

# Forzamos la ruta completa a los .pfb reales
_fontdata.standardFonts['Courier'] = 'Courier'
_fontdata.standardFonts['Courier-Bold'] = 'Courier-Bold'
_fontdata.standardFonts['Courier-Oblique'] = 'Courier-Oblique'
_fontdata.standardFonts['Courier-BoldOblique'] = 'Courier-BoldOblique'

print("🔧 Font patch loaded: Courier mapped")
