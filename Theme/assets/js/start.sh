#!/bin/sh
# Injecte la balise du script Helou dans index.html au demarrage du conteneur.
# Idempotent : si la balise est deja presente, on ne fait rien.
# index.html reste celui de la version installee de Jellyfin : une mise a jour
# ne casse rien, la balise est simplement reinjectee au demarrage suivant.
INDEX=/jellyfin/jellyfin-web/index.html
TAG='<script defer src="mz/helou-detail.js"></script>'
if ! grep -q "mz/helou-detail.js" "$INDEX" 2>/dev/null; then
    sed -i "s|</body>|${TAG}</body>|" "$INDEX"
fi
exec /jellyfin/jellyfin
