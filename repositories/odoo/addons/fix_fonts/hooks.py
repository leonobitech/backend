from odoo import models
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import Type1Font, Type1Face
import os

def _register_courier():
    afm_path = '/usr/share/fonts/type1/gsfonts/n022003l.afm'
    pfb_path = '/usr/share/fonts/type1/gsfonts/n022003l.pfb'

    if os.path.exists(afm_path) and os.path.exists(pfb_path):
        try:
            face = Type1Face('Courier', afmFile=afm_path, pfbFile=pfb_path)
            font = Type1Font('Courier', face)
            pdfmetrics.registerFont(font)
            print("✅ Courier registrado manualmente en ReportLab")
        except Exception as e:
            print("❌ Error registrando Courier:", e)
    else:
        print("⚠️ Archivos .afm o .pfb no encontrados para Courier")

# Ejecutar en carga del módulo
_register_courier()

# Dummy model para que Odoo lo instale
class FixFonts(models.AbstractModel):
    _name = 'fix_fonts.hook'
    _description = 'Hook para registrar Courier en ReportLab'
