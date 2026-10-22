import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Configuration
const PORT = parseInt(process.env.WHATSAPP_PORT || '3001', 10);
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8080';
let API_KEY = process.env.API_KEY || '';
const AUTH_DIR = process.env.AUTH_DIR || './auth_info_baileys';
const ALLOWED_NUMBERS = (process.env.ALLOWED_NUMBERS || '')
  .split(',')
  .map((n) => n.trim().replace(/\D/g, ''))
  .filter((n) => n.length > 0);
const PAIRING_PHONE = (process.env.PAIRING_PHONE || process.env.PHONE_NUMBER || '').replace(/\D/g, '');

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  `Tu es Antigravity, un assistant IA expert propulsé par Claude Sonnet 4.6. 
Tu réponds directement aux messages WhatsApp. 
Règles :
- Sois concis, direct et efficace, adapté à la lecture sur smartphone.
- Utilise la syntaxe WhatsApp : *gras*, _italique_, ~barré~, \`code inline\`, \`\`\`bloc de code\`\`\`.
- Si on te demande du code ou des explications techniques, sois précis et clair.
- Réponds toujours dans la langue de l'utilisateur.`;

// In-memory conversation history per WhatsApp JID
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
const conversationHistory = new Map<string, ChatMessage[]>();
const MAX_HISTORY_MESSAGES = 16;

// Connection & Socket state
let sock: ReturnType<typeof makeWASocket> | null = null;
let currentMode: 'qr' | 'pairing' = PAIRING_PHONE ? 'pairing' : 'qr';
let pairingPhoneTarget: string | null = PAIRING_PHONE || null;
let currentQR: string | null = null;
let currentQRDataUrl: string | null = null;
let currentPairingCode: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' = 'disconnected';
let connectedPhone: string | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

const logger = pino({ level: 'info' });

// Ensure auth dir exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Fetch API key from backend if not provided
async function ensureApiKey(): Promise<string> {
  if (API_KEY) return API_KEY;
  try {
    const res = await fetch(`${BACKEND_URL}/api/user/key`);
    if (res.ok) {
      const data = (await res.json()) as { api_key?: string };
      if (data.api_key) {
        API_KEY = data.api_key;
        logger.info(`Récupéré clé API automatique depuis le serveur: ${API_KEY.slice(0, 10)}...`);
        return API_KEY;
      }
    }
  } catch (err: any) {
    logger.warn(`Impossible de joindre /api/user/key: ${err.message}`);
  }
  return '';
}

// Call Antigravity / Claude API
async function askAntigravity(jid: string, userText: string): Promise<string> {
  await ensureApiKey();

  let history = conversationHistory.get(jid) || [];
  history.push({ role: 'user', content: userText });

  if (history.length > MAX_HISTORY_MESSAGES) {
    history = history.slice(-MAX_HISTORY_MESSAGES);
  }
  conversationHistory.set(jid, history);

  const messagesPayload = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const res = await fetch(`${BACKEND_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      messages: messagesPayload,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur API (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const assistantReply =
    data.choices?.[0]?.message?.content || data.response || "Désolé, aucune réponse générée.";

  history.push({ role: 'assistant', content: assistantReply });
  if (history.length > MAX_HISTORY_MESSAGES) {
    history = history.slice(-MAX_HISTORY_MESSAGES);
  }
  conversationHistory.set(jid, history);

  return assistantReply;
}

// Split large messages into chunks for WhatsApp
function splitMessage(text: string, maxLength = 3800): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }
    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }
  return chunks;
}

// Register incoming message handlers on a socket instance
function registerMessageHandler(s: ReturnType<typeof makeWASocket>) {
  s.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      const isFromMe = msg.key.fromMe ?? false;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@broadcast')) continue;

      const isGroup = jid.endsWith('@g.us');
      const senderJid = isGroup ? msg.key.participant || '' : jid;
      const senderPhone = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');

      if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(senderPhone)) {
        logger.info(`Message ignoré du numéro non autorisé: +${senderPhone}`);
        continue;
      }

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      const trimmedText = text.trim();
      if (!trimmedText) continue;

      if (isGroup) {
        const myJid = s?.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const mentionedMe = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(myJid);
        const hasPrefix = trimmedText.startsWith('!ai ') || trimmedText.startsWith('!claude ') || trimmedText.startsWith('/ai ');
        if (!mentionedMe && !hasPrefix) continue;
      }

      if (isFromMe && !isGroup) {
        if (!trimmedText.startsWith('!ai ') && !trimmedText.startsWith('!claude ') && !trimmedText.startsWith('! ') && !trimmedText.startsWith('/ai ')) {
          continue;
        }
      }

      let cleanPrompt = trimmedText
        .replace(/^(!ai|!claude|\/ai)\s+/i, '')
        .replace(/^!\s*/, '')
        .trim();

      if (cleanPrompt === '/clear' || cleanPrompt === '!clear' || cleanPrompt === '!reset') {
        conversationHistory.delete(jid);
        await s?.sendMessage(jid, { text: '🧹 *Historique de discussion réinitialisé avec succès !*' }, { quoted: msg });
        continue;
      }

      if (cleanPrompt === '/help' || cleanPrompt === '!help') {
        const helpMsg = `🤖 *Antigravity IA (Claude Sonnet 4.6)*

*Commandes disponibles :*
• Envoyez n'importe quel message pour discuter avec l'IA.
• \`/clear\` : Réinitialise la mémoire de la conversation.
• \`/help\` : Affiche cette aide.

_Vos discussions sont sécurisées et traitées directement sur votre serveur privé._`;
        await s?.sendMessage(jid, { text: helpMsg }, { quoted: msg });
        continue;
      }

      logger.info(`Message reçu de +${senderPhone} : "${cleanPrompt.slice(0, 50)}..."`);

      try {
        await s?.sendPresenceUpdate('composing', jid);
        const reply = await askAntigravity(jid, cleanPrompt);
        await s?.sendPresenceUpdate('paused', jid);

        const chunks = splitMessage(reply);
        for (const chunk of chunks) {
          await s?.sendMessage(jid, { text: chunk }, { quoted: msg });
        }
      } catch (err: any) {
        logger.error(err, 'Erreur traitement message');
        await s?.sendPresenceUpdate('paused', jid);
        await s?.sendMessage(
          jid,
          { text: `⚠️ *Erreur Antigravity* : ${err.message || 'Le serveur n\'a pas pu répondre.'}` },
          { quoted: msg }
        );
      }
    }
  });
}

// Clean contents of auth dir without removing the docker volume mount point (avoids EBUSY)
function clearAuthDir() {
  if (fs.existsSync(AUTH_DIR)) {
    try {
      const files = fs.readdirSync(AUTH_DIR);
      for (const file of files) {
        fs.rmSync(path.join(AUTH_DIR, file), { recursive: true, force: true });
      }
    } catch (e: any) {
      logger.error(e, 'Erreur nettoyage auth dir');
    }
  }
}

// Cleanly close any previous socket and cancel reconnect timers
function cleanupOldSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.end(undefined);
    } catch (_) {}
    sock = null;
  }
}

// Single entrance point for starting WhatsApp (QR mode or Pairing mode)
async function startWhatsApp(pairingNumber?: string): Promise<string | undefined> {
  cleanupOldSocket();

  if (pairingNumber) {
    currentMode = 'pairing';
    pairingPhoneTarget = pairingNumber.replace(/\D/g, '');
    logger.info(`Passage en mode code d'association pour +${pairingPhoneTarget}...`);

    // Clean auth folder to avoid key conflicts
    clearAuthDir();
  }

  connectionStatus = 'connecting';
  currentQR = null;
  currentQRDataUrl = null;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  logger.info(`Démarrage socket WhatsApp en mode [${currentMode}] (Baileys v${version.join('.')})...`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && currentMode === 'qr') {
      currentQR = qr;
      connectionStatus = 'qr_ready';
      try {
        currentQRDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
      } catch (e: any) {
        logger.error(e, 'Erreur génération QR data URL');
      }
      console.log('\n======================================================');
      console.log('📱 SCANNEZ LE QR CODE CI-DESSOUS DANS WHATSAPP :');
      console.log('======================================================\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      currentQR = null;
      currentQRDataUrl = null;
      connectionStatus = 'disconnected';
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn(`Connexion fermée. Statut: ${statusCode}. Reconnexion: ${shouldReconnect}`);

      if (shouldReconnect) {
        reconnectTimer = setTimeout(() => {
          // If we had pairing code target, retry with pairing mode
          if (currentMode === 'pairing' && pairingPhoneTarget) {
            startWhatsApp(pairingPhoneTarget).catch(() => {});
          } else {
            startWhatsApp().catch(() => {});
          }
        }, 5000);
      }
    } else if (connection === 'open') {
      currentQR = null;
      currentQRDataUrl = null;
      currentPairingCode = null;
      currentMode = 'qr';
      pairingPhoneTarget = null;
      connectionStatus = 'connected';
      const id = sock?.user?.id || '';
      connectedPhone = id.split(':')[0].split('@')[0];
      logger.info(`✅ Connecté à WhatsApp avec succès ! Numéro : +${connectedPhone}`);
      console.log(`\n✅ Connecté à WhatsApp avec succès ! Numéro associé : +${connectedPhone}\n`);
    }
  });

  registerMessageHandler(sock);

  // If in pairing mode, wait for noise handshake to be established and request code
  if (currentMode === 'pairing' && pairingPhoneTarget && !state.creds.registered) {
    logger.info(`Attente de l'établissement du socket avant demande de code...`);
    await new Promise((resolve) => setTimeout(resolve, 4000));

    if (sock && !sock.authState.creds.registered) {
      logger.info(`Demande de code d'association pour +${pairingPhoneTarget}...`);
      const code = await sock.requestPairingCode(pairingPhoneTarget);
      currentPairingCode = code;
      logger.info(`🔑 Code d'association généré : ${code}`);
      console.log(`\n======================================================`);
      console.log(`🔑 CODE D'ASSOCIATION POUR LE NUMÉRO +${pairingPhoneTarget} : ${code}`);
      console.log(`======================================================\n`);
      return code;
    }
  }

  return undefined;
}

// Web UI & API server
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // API Status endpoint
  if (url.pathname === '/api/status' || url.pathname === '/whatsapp/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: connectionStatus,
        phone: connectedPhone,
        hasQr: !!currentQRDataUrl,
        qr: currentQRDataUrl,
        pairingCode: currentPairingCode,
        allowedNumbers: ALLOWED_NUMBERS,
      })
    );
    return;
  }

  // API Pairing Code endpoint (No camera needed)
  if ((url.pathname === '/api/pairing-code' || url.pathname === '/whatsapp/api/pairing-code') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const phone = (data.phoneNumber || '').toString().replace(/\D/g, '');
        if (!phone || phone.length < 8) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Veuillez saisir un numéro valide avec l\'indicatif pays (ex: 33766817354).' }));
          return;
        }
        const code = await startWhatsApp(phone);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, code: currentPairingCode || code }));
      } catch (err: any) {
        logger.error(err, 'Erreur génération pairing code');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Impossible d\'obtenir le code auprès de WhatsApp.' }));
      }
    });
    return;
  }

  // Clear session endpoint
  if (url.pathname === '/api/logout' || url.pathname === '/whatsapp/api/logout') {
    clearAuthDir();
    try {
      sock?.logout();
    } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    setTimeout(() => startWhatsApp(), 1000);
    return;
  }

  // HTML page
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity WhatsApp Bridge</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0c0e15; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-[#131622] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
    <div class="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/20 mb-4">
      💬
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-white mb-1">WhatsApp & Antigravity</h1>
    <p class="text-slate-400 text-sm mb-6">Associez votre WhatsApp à Claude Sonnet 4.6</p>

    <!-- Tab navigation -->
    <div id="tab-nav" class="flex p-1 bg-[#0c0e15] border border-slate-800 rounded-2xl mb-5">
      <button id="tab-code-btn" onclick="setTab('code')" class="flex-1 py-2 text-xs font-semibold rounded-xl transition bg-emerald-600 text-white shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
        <span>🔢 Sans caméra (Code)</span>
      </button>
      <button id="tab-qr-btn" onclick="setTab('qr')" class="flex-1 py-2 text-xs font-semibold rounded-xl transition text-slate-400 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer">
        <span>📷 Scanner QR Code</span>
      </button>
    </div>

    <div id="status-card" class="bg-[#1a1e2e] border border-slate-700/60 rounded-2xl p-5 mb-6">
      
      <!-- Loading State -->
      <div id="loading-spinner" class="py-8">
        <div class="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3"></div>
        <p class="text-slate-400 text-sm">Initialisation de la passerelle WhatsApp...</p>
      </div>

      <!-- TAB 1: PAIRING CODE (NO CAMERA NEEDED) -->
      <div id="code-container" class="hidden text-left">
        <p class="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 text-center">
          Connexion sans caméra par code à 8 chiffres
        </p>
        <p class="text-xs text-slate-300 mb-4 leading-relaxed text-center">
          Entrez votre numéro WhatsApp pour générer un code d'association à saisir directement dans l'application.
        </p>

        <form onsubmit="requestCode(event)" class="space-y-3 mb-4">
          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">Votre numéro (avec indicatif pays, sans +)</label>
            <input 
              id="phone-input" 
              type="tel" 
              placeholder="Ex: 33766817354" 
              class="w-full px-3.5 py-2.5 bg-[#0c0e15] border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 font-mono tracking-wider"
              required 
            />
          </div>
          <button 
            id="code-submit-btn" 
            type="submit" 
            class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer"
          >
            Obtenir le code d'association
          </button>
        </form>

        <div id="code-display" class="hidden bg-[#0c0e15] border border-emerald-500/40 rounded-2xl p-4 text-center mb-4">
          <p class="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Votre code d'association</p>
          <div class="flex items-center justify-center gap-3 my-2">
            <span id="pairing-code-text" class="text-2xl font-mono font-extrabold tracking-widest text-emerald-300"></span>
            <button onclick="copyPairingCode()" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition" title="Copier le code">
              Copier
            </button>
          </div>
          <p class="text-[11px] text-emerald-400 font-medium">Saisissez-le dans WhatsApp sur votre mobile</p>
        </div>

        <div class="bg-black/30 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1.5">
          <p class="font-semibold text-slate-200 mb-1">Instructions sur votre téléphone :</p>
          <p>1. Ouvrez <strong>WhatsApp</strong>.</p>
          <p>2. Allez dans <strong>Réglages</strong> (ou ⋮) &gt; <strong>Appareils connectés</strong> &gt; <strong>Connecter un appareil</strong>.</p>
          <p>3. En bas de l'écran du scanner, touchez :<br/><span class="text-emerald-400 font-medium">« Associer avec un numéro de téléphone »</span>.</p>
          <p>4. Tapez ce code à 8 chiffres/lettres.</p>
        </div>
      </div>

      <!-- TAB 2: QR CODE -->
      <div id="qr-container" class="hidden">
        <p class="text-xs uppercase font-semibold text-emerald-400 tracking-wider mb-3">Scannez avec votre téléphone</p>
        <div class="bg-white p-3 rounded-2xl inline-block shadow-xl mb-4">
          <img id="qr-image" src="" alt="QR Code WhatsApp" class="w-56 h-56 mx-auto object-contain" />
        </div>
        <ol class="text-left text-xs text-slate-300 space-y-1.5 bg-black/30 p-3.5 rounded-xl border border-slate-800">
          <li>1. Ouvrez <strong>WhatsApp</strong> sur votre téléphone</li>
          <li>2. Allez dans <strong>Réglages</strong> &gt; <strong>Appareils connectés</strong></li>
          <li>3. Touchez <strong>Connecter un appareil</strong></li>
          <li>4. Pointez votre caméra vers ce code QR</li>
        </ol>
      </div>

      <!-- CONNECTED STATE -->
      <div id="connected-container" class="hidden py-4">
        <div class="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
          ✓
        </div>
        <h3 class="text-lg font-semibold text-white">Connecté avec succès !</h3>
        <p id="connected-phone" class="text-emerald-400 font-mono text-sm mt-1 mb-4"></p>
        <p class="text-xs text-slate-400 leading-relaxed">
          Votre bot est en ligne. Envoyez un message WhatsApp à ce compte (ou écrivez à vous-même) pour discuter avec Claude !
        </p>
        <button onclick="logout()" class="mt-5 px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs rounded-xl transition border border-rose-500/30 cursor-pointer">
          Déconnecter cet appareil
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-4">
      <span>Moteur: Claude Sonnet 4.6</span>
      <a href="/" class="text-indigo-400 hover:underline">← Retour à l'interface Web</a>
    </div>
  </div>

  <script>
    let activeTab = 'code';

    function setTab(tab) {
      activeTab = tab;
      const codeBtn = document.getElementById('tab-code-btn');
      const qrBtn = document.getElementById('tab-qr-btn');
      const codeCont = document.getElementById('code-container');
      const qrCont = document.getElementById('qr-container');

      if (tab === 'code') {
        codeBtn.className = 'flex-1 py-2 text-xs font-semibold rounded-xl transition bg-emerald-600 text-white shadow-sm flex items-center justify-center gap-1.5 cursor-pointer';
        qrBtn.className = 'flex-1 py-2 text-xs font-semibold rounded-xl transition text-slate-400 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer';
        codeCont.classList.remove('hidden');
        qrCont.classList.add('hidden');
      } else {
        qrBtn.className = 'flex-1 py-2 text-xs font-semibold rounded-xl transition bg-emerald-600 text-white shadow-sm flex items-center justify-center gap-1.5 cursor-pointer';
        codeBtn.className = 'flex-1 py-2 text-xs font-semibold rounded-xl transition text-slate-400 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer';
        qrCont.classList.remove('hidden');
        codeCont.classList.add('hidden');
      }
    }

    async function requestCode(e) {
      e.preventDefault();
      const phone = document.getElementById('phone-input').value.trim();
      const btn = document.getElementById('code-submit-btn');
      btn.disabled = true;
      btn.innerText = 'Établissement de la connexion... (~4 sec)';

      try {
        const res = await fetch('/whatsapp/api/pairing-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (data.code) {
          const formatted = data.code.length === 8 ? data.code.slice(0, 4) + ' - ' + data.code.slice(4) : data.code;
          document.getElementById('pairing-code-text').innerText = formatted;
          document.getElementById('code-display').classList.remove('hidden');
        } else {
          alert('Erreur: ' + (data.error || 'Impossible d\\'obtenir le code'));
        }
      } catch (err) {
        alert('Erreur: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerText = 'Obtenir le code d\\'association';
      }
    }

    function copyPairingCode() {
      const code = document.getElementById('pairing-code-text').innerText.replace(/\\s*-\\s*/, '');
      navigator.clipboard.writeText(code);
      alert('Code ' + code + ' copié dans le presse-papier !');
    }

    async function updateStatus() {
      try {
        const res = await fetch('/whatsapp/api/status');
        const data = await res.json();
        
        document.getElementById('loading-spinner').classList.add('hidden');
        
        if (data.status === 'connected') {
          document.getElementById('tab-nav').classList.add('hidden');
          document.getElementById('code-container').classList.add('hidden');
          document.getElementById('qr-container').classList.add('hidden');
          document.getElementById('connected-container').classList.remove('hidden');
          document.getElementById('connected-phone').innerText = '+' + (data.phone || '');
        } else {
          document.getElementById('tab-nav').classList.remove('hidden');
          document.getElementById('connected-container').classList.add('hidden');

          if (data.pairingCode) {
            const formatted = data.pairingCode.length === 8 ? data.pairingCode.slice(0, 4) + ' - ' + data.pairingCode.slice(4) : data.pairingCode;
            document.getElementById('pairing-code-text').innerText = formatted;
            document.getElementById('code-display').classList.remove('hidden');
          }

          if (data.hasQr && data.qr) {
            document.getElementById('qr-image').src = data.qr;
          }

          if (activeTab === 'code') {
            document.getElementById('code-container').classList.remove('hidden');
            document.getElementById('qr-container').classList.add('hidden');
          } else {
            document.getElementById('qr-container').classList.remove('hidden');
            document.getElementById('code-container').classList.add('hidden');
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function logout() {
      if (!confirm('Voulez-vous vraiment déconnecter WhatsApp ?')) return;
      await fetch('/whatsapp/api/logout');
      location.reload();
    }

    setInterval(updateStatus, 3000);
    updateStatus();
  </script>
</body>
</html>`);
});

// Start HTTP server and WhatsApp connection
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Serveur Web WhatsApp démarré sur http://0.0.0.0:${PORT}`);
  startWhatsApp().catch((err) => logger.error(err, 'Erreur démarrage WhatsApp'));
});
