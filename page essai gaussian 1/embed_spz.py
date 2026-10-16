"""Embarque modele.spz dans modele_spz.js pour que index.html fonctionne en double-clic.

Utilisation : python embed_spz.py            (traite modele.spz du dossier)
              python embed_spz.py mon_fichier.spz
Sous Windows, tu peux aussi glisser ton .spz sur ce script.
"""
import base64
import pathlib
import sys

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "modele.spz")
if not src.exists():
    sys.exit(f"Fichier introuvable : {src}")

out = src.with_name("modele_spz.js")
b64 = base64.b64encode(src.read_bytes()).decode("ascii")
out.write_text(f'window.SPZ_B64="{b64}";', encoding="utf-8")
print(f"OK : {out} créé ({out.stat().st_size / 1e6:.1f} Mo)")
