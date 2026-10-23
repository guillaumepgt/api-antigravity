#!/usr/bin/env bash
set -e

echo "========================================================="
echo "  🚀 Démarrage du conteneur Antigravity All-in-One       "
echo "========================================================="

# 1. Démarrer le terminal web ttyd sur le port 7681
# Permet à l'utilisateur de se connecter à son compte Google depuis son navigateur sans clé API !
if command -v ttyd >/dev/null 2>&1; then
    echo "📟 Lancement du terminal web d'authentification sur le port 7681 (support multi-profils)..."
    ttyd -b /terminal -p 7681 -a -W /usr/local/bin/terminal-wrapper.sh &
fi

# 2. Démarrer l'API backend Rust sur 127.0.0.1:8000
echo "⚡ Démarrage de l'API Antigravity interne sur le port 8000..."
HOST=127.0.0.1 PORT=8000 backend &

# 3. Démarrer Nginx en premier plan sur le port public 8080
echo "🌐 Démarrage du serveur web Nginx (UI + API + Terminal) sur le port 8080..."
exec nginx -g 'daemon off;'
