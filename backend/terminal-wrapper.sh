#!/usr/bin/env bash
set -e

TICKET="$1"
if [ -z "$TICKET" ]; then
    echo "❌ Accès refusé : Aucun ticket de session fourni."
    echo "Veuillez vous connecter via l'interface web."
    sleep 3
    exit 1
fi

# Verify ticket with backend API
RES=$(curl -s "http://127.0.0.1:8000/api/internal/verify-terminal-ticket?ticket=$TICKET" || echo '{"valid":false}')

VALID=$(echo "$RES" | grep -o '"valid":true' || true)
if [ -z "$VALID" ]; then
    ERR=$(echo "$RES" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    echo "❌ Accès refusé : ${ERR:-Ticket invalide ou expiré.}"
    echo "Veuillez relancer la connexion depuis l'interface web."
    sleep 3
    exit 1
fi

HOME_DIR=$(echo "$RES" | grep -o '"home":"[^"]*"' | cut -d'"' -f4)
CLI_DIR=$(echo "$RES" | grep -o '"gemini_cli_dir":"[^"]*"' | cut -d'"' -f4)
WS_DIR=$(echo "$RES" | grep -o '"workspace_dir":"[^"]*"' | cut -d'"' -f4)
TYPE=$(echo "$RES" | grep -o '"type":"[^"]*"' | cut -d'"' -f4)
EMAIL=$(echo "$RES" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)

export HOME="$HOME_DIR"
export GEMINI_CLI_DIR="$CLI_DIR"
export GEMINI_FORCE_FILE_STORAGE=true
export PATH="/root/.local/bin:/usr/local/bin:$PATH"

mkdir -p "$CLI_DIR" "$WS_DIR"
cd "$WS_DIR"

clear
echo "========================================================="
echo "  🚀 Antigravity - Session Sécurisée                     "
echo "========================================================="
if [ "$TYPE" = "login" ]; then
    echo "  🔑 Connexion Google : Suivez le lien affiché ci-dessous."
    echo "========================================================="
    echo ""
    agy || true
    echo ""
    echo "✅ Authentification terminée. Vous pouvez fermer ce terminal."
    sleep 2
else
    echo "  👤 Compte Google : ${EMAIL:-Connecté}"
    echo "  📁 Espace de travail : $WS_DIR"
    echo "========================================================="
    echo ""
    exec bash
fi
