#!/bin/sh
# Injecte la balise du script Helou dans index.html au demarrage du conteneur.
#
# Le jeton ?v= est l'heure de demarrage : chaque redemarrage produit une URL
# neuve, ce qui invalide le cache des navigateurs. Sans lui, remplacer le
# fichier sur le NAS ne suffit pas, les clients gardent leur ancienne copie.
#
# index.html reste celui de la version installee de Jellyfin : une mise a jour
# ne casse rien, la balise est simplement reinjectee au demarrage suivant.
INDEX=/jellyfin/jellyfin-web/index.html
V=$(date +%s)
TAG='<script defer src="mz/helou-detail.js?v='"$V"'"></script>'

# Retire une balise precedente (le conteneur peut redemarrer sans etre recree)
sed -i 's|<script defer src="mz/helou-detail\.js[^"]*"></script>||g' "$INDEX"
sed -i "s|</body>|${TAG}</body>|" "$INDEX"

exec /jellyfin/jellyfin
