# 🚀 Antigravity Remote API & Web UI

Projet complet permettant d'exposer **Google Antigravity** sous la forme d'une **API REST/SSE en Rust**, avec un **frontend moderne en TypeScript & Svelte 5**, packagés sous **Docker** et accessibles depuis n'importe où via un **VPN privé (Tailscale / WireGuard)** ou un reverse-proxy.

---

## 🏛️ Architecture

```
                          ┌──────────────────────────────────────────────┐
                          │         Client (Mobile / Laptop / Web)       │
                          │   http://<tailscale-ip>:3000 (ou domaine)    │
                          └──────────────────────┬───────────────────────┘
                                                 │
                                           [ VPN / Réseau ]
                                                 │
                 ┌───────────────────────────────┴───────────────────────────────┐
                 │                       Docker Host                             │
                 │                                                               │
                 │  ┌────────────────────────┐       ┌────────────────────────┐  │
                 │  │   Frontend Container   │       │   Backend Container    │  │
                 │  │     (Port 3000)        │       │     (Port 8080)        │  │
                 │  │                        │       │                        │  │
                 │  │  • Svelte 5 + TS + CSS │       │  • Rust (Axum + Tokio) │  │
                 │  │  • Nginx Reverse Proxy │──────>│  • API REST & SSE      │  │
                 │  │    (/api/ -> backend)  │       │  • Wrapper `agy` CLI   │  │
                 │  └────────────────────────┘       └───────────┬────────────┘  │
                 │                                               │               │
                 │                                   ┌───────────┴────────────┐  │
                 │                                   │  Antigravity CLI (agy) │  │
                 │                                   └───────────┬────────────┘  │
                 │                                               │               │
                 │                                ┌──────────────┴────────────┐  │
                 │                                │ Volumes : ~/.gemini       │  │
                 │                                │           /workspace      │  │
                 │                                └───────────────────────────┘  │
                 └───────────────────────────────────────────────────────────────┘
```

- **Backend (Rust / Axum)** :
  - Orchestration de processus asynchrone ultra-rapide et légère (~15 Mo de RAM).
  - Exécute le CLI natif Antigravity (`agy`) en mode streaming (`--output-format stream-json`).
  - API REST avec streaming temps réel **Server-Sent Events (SSE)**.
  - Sécurité par **API Key / Bearer Token**.
  - Lecture directe de l'historique et des résumés de conversations (`conversation_summaries.db`).

- **Frontend (Svelte 5 / TypeScript / Vite / Tailwind)** :
  - Interface de chat temps réel avec rendu Markdown et coloration syntaxique du code.
  - Déroulé de raisonnement de l'agent (*Thinking Process*) escamotable.
  - Cartes et badges pour l'exécution d'outils (`run_command`, `write_to_file`, etc.).
  - Sélecteur de modèle (`Gemini 3.8 Flash High`, `Claude Sonnet 4.6`, `GPT-OSS 120B`, etc.).
  - Historique des conversations et reprise de session par ID.
  - 100% responsive (mobile, tablette, desktop).

- **Docker Compose** :
  - Déploiement multi-conteneurs prêt à l'emploi.
  - Montage de votre session Antigravity existante (`~/.gemini`) pour réutiliser vos accès sans re-login.

---

## ⚡ Démarrage Rapide (Docker Compose)

### 1. Configuration de l'environnement

Copiez le fichier d'exemple `.env.example` en `.env` :

```bash
cp .env.example .env
```

Éditez le fichier `.env` si vous souhaitez définir une clé d'API secrète :
```env
API_KEY=votre_cle_secrete_ultra_robuste
WORKSPACE_PATH=./workspace
GEMINI_DATA_PATH=~/.gemini
```

### 2. Lancer les conteneurs

```bash
docker compose up -d --build
```

- L'interface Web Svelte est accessible sur : `http://localhost:3000` (ou `http://localhost:8080`)
- L'API Rust est accessible sur : `http://localhost:8080` (et via `/api/*` sur le port 3000)

Pour consulter les logs du backend :
```bash
docker compose logs -f backend
```

---

## 🔑 Mode Sans Clé API : Connexion avec son propre compte Google

Vous n'avez **pas besoin de clé API payante** ! Antigravity utilise le quota gratuit de votre compte Google personnel via OAuth :

1. Ouvrez l'interface web sur `http://localhost:3000` (ou le port de votre instance).
2. Un bandeau bleu s'affiche : **"Aucune clé API nécessaire : connectez votre compte Google personnel"**.
3. Cliquez sur **"Se connecter avec Google (Gratuit)"** :
   - Un terminal web interactif s'ouvre dans la fenêtre.
   - Antigravity affiche le lien officiel d'authentification Google OAuth (`https://accounts.google.com/o/oauth2/auth?...`).
   - Ouvrez ce lien dans votre navigateur, choisissez votre compte Google, et validez.
   - Copiez le code d'autorisation fourni par Google et collez-le dans le terminal.
4. Cliquez sur **"Vérifier connexion"** : l'interface passe instantanément au vert et vous pouvez utiliser Antigravity en illimité avec vos quotas personnels !

---

## 🗝️ Clé API Développeur : Requêter son compte en direct (cURL, Python)

Dès que votre conteneur est démarré et relié à votre compte Google, **une clé API personnelle sécurisée (`agy_sk_...`) est générée automatiquement** et stockée dans votre volume persistant :

1. Cliquez sur le bouton **"Clé API"** dans l'en-tête (ou dans le menu latéral *"Clé API Développeur"*).
2. La fenêtre modale vous affiche :
   - Votre clé secrète personnelle (ex: `agy_sk_edadba74fe18...`).
   - Le statut de votre compte Google.
   - Les exemples de requêtes prêts à l'emploi en **cURL** (standard & streaming SSE), **Python** (`requests`), et **JavaScript** (`fetch`).
   - Un bouton pour **régénérer ou faire tourner** votre clé si nécessaire.
3. Vous pouvez ensuite faire vos requêtes depuis n'importe quel terminal ou script externe :

```bash
# Requête simple (JSON)
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer agy_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explique la relativité générale.",
    "model": "gemini-3.8-flash-high",
    "stream": false
  }'
```

```bash
# Requête en streaming temps réel (Server-Sent Events)
curl -N -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer agy_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Écris un script bash de déploiement.",
    "stream": true
  }'
```

---

## 🤖 Relier Claude Code, Cursor, Aider ou Continue

Votre serveur implémente nativement les spécifications officielles **Anthropic Messages** (`/v1/messages`) et **OpenAI Chat Completions** (`/v1/chat/completions`). Vous pouvez l'utiliser directement comme backend pour vos outils d'IA préférés !

### 1. Avec Claude Code (CLI officiel Anthropic)
Dans votre terminal :
```bash
# Rediriger Claude Code vers votre serveur Antigravity
export ANTHROPIC_BASE_URL="http://localhost:8080"
export ANTHROPIC_API_KEY="<VOTRE_CLE_AGY_SK>"

# Lancer Claude Code
claude
```
*Claude Code utilisera directement le modèle `claude-sonnet-4-6` via votre quota Google personnel sans aucun surcoût Anthropic !*

### 2. Avec Aider
```bash
export OPENAI_API_BASE="http://localhost:8080/v1"
export OPENAI_API_KEY="<VOTRE_CLE_AGY_SK>"

aider --model claude-sonnet-4-6
```

### 3. Avec Cursor, Continue.dev ou Cline (VS Code / JetBrains)
- **Provider** : `OpenAI Compatible`
- **Base URL** : `http://localhost:8080/v1` (ou votre IP Tailscale)
- **API Key** : `<VOTRE_CLE_AGY_SK>`
- **Modèle** : `claude-sonnet-4-6` ou `gemini-3.8-flash-high`

### 4. Avec les SDKs Python officiels
```python
# Via le SDK Anthropic :
from anthropic import Anthropic

client = Anthropic(base_url="http://localhost:8080", api_key="<VOTRE_CLE_AGY_SK>")
response = client.messages.create(
    model="claude-3-7-sonnet",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Bonjour Claude !"}]
)
print(response.content[0].text)
```

```python
# Via le SDK OpenAI :
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8080/v1", api_key="<VOTRE_CLE_AGY_SK>")
response = client.chat.completions.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": "Bonjour !"}]
)
print(response.choices[0].message.content)
```

---

## ⚡ Lancement de Conteneur à la Demande via `curl`

Vous pouvez instancier un conteneur Antigravity isolé pour n'importe quel collègue, ami ou utilisateur directement depuis un simple `curl` :

### Méthode 1 : Requête API directe
```bash
# Exemple pour un utilisateur "thomas" sur le port 3005 :
curl -s "http://localhost:8080/spawn?user=thomas&port=3005"
```

**Réponse JSON immédiate :**
```json
{
  "status": "ready",
  "container_name": "antigravity-thomas",
  "user": "thomas",
  "port": 3005,
  "url": "http://localhost:3005",
  "terminal_url": "http://localhost:3005/terminal/",
  "instructions": "Ouvrez cette URL pour vous connecter à votre propre compte Google personnel !"
}
```

### Méthode 2 : Script bash prêt à l'emploi
```bash
# Télécharge et lance le script d'un coup :
curl -sSL http://localhost:8080/launch.sh | bash -s thomas 3005
```

Chaque conteneur ainsi créé est **100% autonome et isolé** :
- Il dispose de son propre volume Docker persistant pour les tokens Google (`gemini_data_thomas`).
- Il dispose de son propre espace de travail (`antigravity-thomas_workspace`).
- Il embarque à la fois l'interface web Svelte, le terminal OAuth et l'API Rust sur le même port unique (`3005`).

---

## 🌐 Se connecter depuis n'importe où (Tailscale / WireGuard)

### Option 1 : Via Tailscale sur la machine hôte (Recommandé & le plus simple)

1. **Installez Tailscale** sur votre serveur / PC hôte si ce n'est pas déjà fait :
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```

2. **Récupérez l'IP Tailscale** de votre machine hôte (IP de type `100.x.y.z`) :
   ```bash
   tailscale ip -4
   ```

3. **Accédez-y depuis votre smartphone, tablette ou autre PC** :
   - Installez l'application Tailscale sur votre appareil distant et connectez-vous au même compte.
   - Ouvrez votre navigateur sur :
     ```
     http://<IP_TAILSCALE>:3000
     ```
   - Cliquez sur **Settings** (en bas à gauche) et renseignez votre `API_KEY` (si configurée dans `.env`).

### Option 2 : Via Tailscale en conteneur Docker (Sidecar)

Si vous préférez que Tailscale s'exécute directement dans le `docker-compose.yml` :
1. Créez une Auth Key réutilisable sur la console d'administration Tailscale ([login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys)).
2. Renseignez-la dans votre `.env` :
   ```env
   TAILSCALE_AUTHKEY=tskey-auth-xxxxx
   ```
3. Décommentez le bloc `tailscale` dans `docker-compose.yml`.

---

## 📡 Documentation de l'API REST & SSE

Toutes les routes protégées nécessitent l'en-tête `Authorization: Bearer <API_KEY>` (ou `x-api-key: <API_KEY>`) si `API_KEY` est configurée.

### 1. `GET /health`
Vérifie la santé du backend, le chemin du binaire et du workspace.
```bash
curl http://localhost:8080/health
```

### 2. `GET /api/models`
Liste les modèles disponibles via Antigravity.
```bash
curl -H "Authorization: Bearer <API_KEY>" http://localhost:8080/api/models
```

### 3. `GET /api/conversations`
Liste les conversations précédentes avec titre, aperçu, date et nombre de tours.
```bash
curl -H "Authorization: Bearer <API_KEY>" http://localhost:8080/api/conversations
```

### 4. `GET /api/conversations/:id/transcript`
Récupère les tours détaillés (étapes, messages utilisateur, réponses modèle, tokens) d'une conversation.
```bash
curl -H "Authorization: Bearer <API_KEY>" http://localhost:8080/api/conversations/<id>/transcript
```

### 5. `POST /api/chat` (Streaming Server-Sent Events)
Envoie un prompt et reçoit le flux en direct des tokens, raisonnements et appels d'outils.

```bash
curl -N -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "prompt": "Explique le rôle de ce projet",
    "model": "gemini-3.8-flash-high",
    "dangerously_skip_permissions": true,
    "stream": true
  }'
```

#### Événements SSE reçus :
- `event: init` : Contient le `conversation_id` et les outils disponibles.
- `event: step_update` : Contient les `text_delta` (tokens en direct), `thought_delta` ou `tool_call`.
- `event: result` : Contient la réponse finale consolidée et les métriques de tokens (`usage`).
- `event: done` : Indique la fin du tour.

---

## 🛠️ Développement Local (sans Docker)

### Backend (Rust)
```bash
cd backend
cargo run
```
Le serveur écoute par défaut sur `http://localhost:8080`.

### Frontend (Svelte 5 / TypeScript)
```bash
cd frontend
npm install
npm run dev
```
L'interface de dev Vite écoute sur `http://localhost:5173` et relaie automatiquement `/api` et `/health` vers le backend Rust.

---

## 🔒 Sécurité & Bonnes Pratiques
- **API Key** : Activez impérativement une clé d'API forte dans `.env` dès que l'instance est accessible sur un réseau.
- **Auto-Approve Tools (`--dangerously-skip-permissions`)** : Permet au modèle d'exécuter des commandes terminal et de modifier des fichiers de manière autonome dans le conteneur. Le dossier `./workspace` isole ces modifications du reste de votre système hôte.
