try:
    import reportlab.pdfbase._fontdata as fd
    fd.standardFonts.update({"Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"})
except Exception as e:
    print(f"[fix_fonts preload] {e}")
