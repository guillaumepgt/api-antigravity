import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  proto,
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

// Connection state
let currentQR: string | null = null;
let currentQRDataUrl: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' = 'disconnected';
let connectedPhone: string | null = null;
let sock: ReturnType<typeof makeWASocket> | null = null;

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

  // Retrieve or create history for this user
  let history = conversationHistory.get(jid) || [];
  history.push({ role: 'user', content: userText });

  // Limit history window
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

  // Save assistant reply to context
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

// Connect to WhatsApp
async function connectToWhatsApp() {
  connectionStatus = 'connecting';
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  logger.info(`Démarrage de la connexion WhatsApp (Baileys v${version.join('.')})...`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Antigravity AI', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
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
      console.log('\nOu ouvrez votre navigateur sur http://<VOTRE-SERVEUR>:3000/whatsapp/\n');
    }

    if (connection === 'close') {
      currentQR = null;
      currentQRDataUrl = null;
      connectionStatus = 'disconnected';
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`Connexion WhatsApp interrompue. Statut: ${statusCode}. Reconnexion: ${shouldReconnect}`);

      if (statusCode === DisconnectReason.loggedOut) {
        logger.warn('Déconnecté de WhatsApp par l\'utilisateur. Nettoyage des identifiants...');
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
        } catch (_) {}
      }

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        setTimeout(connectToWhatsApp, 5000);
      }
    } else if (connection === 'open') {
      currentQR = null;
      currentQRDataUrl = null;
      connectionStatus = 'connected';
      const id = sock?.user?.id || '';
      connectedPhone = id.split(':')[0].split('@')[0];
      logger.info(`✅ Connecté à WhatsApp avec succès ! Numéro : +${connectedPhone}`);
      console.log(`\n✅ Connecté à WhatsApp avec succès ! Numéro associé : +${connectedPhone}\n`);
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      // Ignore messages sent by bot itself unless it's a message to self in personal chat
      const isFromMe = msg.key.fromMe ?? false;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@broadcast')) continue;

      // Check if message is in a group or direct chat
      const isGroup = jid.endsWith('@g.us');

      // Extract sender phone
      const senderJid = isGroup ? msg.key.participant || '' : jid;
      const senderPhone = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');

      // Security: Allowed numbers filter
      if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(senderPhone)) {
        logger.info(`Message ignoré du numéro non autorisé: +${senderPhone}`);
        continue;
      }

      // Extract text content
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      const trimmedText = text.trim();
      if (!trimmedText) continue;

      // Group trigger rules: only respond if mentioned or starts with !ai or !claude
      if (isGroup) {
        const myJid = sock?.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const mentionedMe = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(myJid);
        const hasPrefix = trimmedText.startsWith('!ai ') || trimmedText.startsWith('!claude ') || trimmedText.startsWith('/ai ');
        if (!mentionedMe && !hasPrefix) continue;
      }

      // Handle message to self (Discuter avec soi-même)
      if (isFromMe && !isGroup) {
        // If message is from me, only trigger if it starts with ! or /ai
        if (!trimmedText.startsWith('!ai ') && !trimmedText.startsWith('!claude ') && !trimmedText.startsWith('! ') && !trimmedText.startsWith('/ai ')) {
          continue;
        }
      }

      // Clean prompt
      let cleanPrompt = trimmedText
        .replace(/^(!ai|!claude|\/ai)\s+/i, '')
        .replace(/^!\s*/, '')
        .trim();

      // Special Commands
      if (cleanPrompt === '/clear' || cleanPrompt === '!clear' || cleanPrompt === '!reset') {
        conversationHistory.delete(jid);
        await sock?.sendMessage(jid, { text: '🧹 *Historique de discussion réinitialisé avec succès !*' }, { quoted: msg });
        continue;
      }

      if (cleanPrompt === '/help' || cleanPrompt === '!help') {
        const helpMsg = `🤖 *Antigravity IA (Claude Sonnet 4.6)*

*Commandes disponibles :*
• Envoyez n'importe quel message pour discuter avec l'IA.
• \`/clear\` : Réinitialise la mémoire de la conversation.
• \`/help\` : Affiche cette aide.

_Vos discussions sont sécurisées et traitées directement sur votre serveur privé._`;
        await sock?.sendMessage(jid, { text: helpMsg }, { quoted: msg });
        continue;
      }

      logger.info(`Message reçu de +${senderPhone} : "${cleanPrompt.slice(0, 50)}..."`);

      try {
        // Show "typing..." presence
        await sock?.sendPresenceUpdate('composing', jid);

        // Fetch response from Antigravity
        const reply = await askAntigravity(jid, cleanPrompt);

        // Stop "typing..."
        await sock?.sendPresenceUpdate('paused', jid);

        // Send split chunks
        const chunks = splitMessage(reply);
        for (const chunk of chunks) {
          await sock?.sendMessage(jid, { text: chunk }, { quoted: msg });
        }
      } catch (err: any) {
        logger.error(`Erreur traitement message: ${err.message}`);
        await sock?.sendPresenceUpdate('paused', jid);
        await sock?.sendMessage(
          jid,
          { text: `⚠️ *Erreur Antigravity* : ${err.message || 'Le serveur n\'a pas pu répondre.'}` },
          { quoted: msg }
        );
      }
    }
  });
}

// Web UI for QR Code and Status
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // API endpoint
  if (url.pathname === '/api/status' || url.pathname === '/whatsapp/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: connectionStatus,
        phone: connectedPhone,
        hasQr: !!currentQRDataUrl,
        qr: currentQRDataUrl,
        allowedNumbers: ALLOWED_NUMBERS,
      })
    );
    return;
  }

  // Clear session endpoint
  if (url.pathname === '/api/logout' || url.pathname === '/whatsapp/api/logout') {
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      sock?.logout();
    } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    setTimeout(connectToWhatsApp, 1000);
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
    <p class="text-slate-400 text-sm mb-6">Connectez votre compte WhatsApp à Claude Sonnet 4.6</p>

    <div id="status-card" class="bg-[#1a1e2e] border border-slate-700/60 rounded-2xl p-5 mb-6">
      <div id="loading-spinner" class="py-8">
        <div class="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3"></div>
        <p class="text-slate-400 text-sm">Chargement de l'état de WhatsApp...</p>
      </div>

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

      <div id="connected-container" class="hidden py-4">
        <div class="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
          ✓
        </div>
        <h3 class="text-lg font-semibold text-white">Connecté avec succès !</h3>
        <p id="connected-phone" class="text-emerald-400 font-mono text-sm mt-1 mb-4"></p>
        <p class="text-xs text-slate-400 leading-relaxed">
          Votre bot est en ligne. Envoyez un message WhatsApp à ce compte (ou écrivez à vous-même si c'est votre propre numéro) pour discuter avec Claude !
        </p>
        <button onclick="logout()" class="mt-5 px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs rounded-xl transition border border-rose-500/30">
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
    async function updateStatus() {
      try {
        const res = await fetch('/whatsapp/api/status');
        const data = await res.json();
        
        document.getElementById('loading-spinner').classList.add('hidden');
        
        if (data.status === 'connected') {
          document.getElementById('qr-container').classList.add('hidden');
          document.getElementById('connected-container').classList.remove('hidden');
          document.getElementById('connected-phone').innerText = '+' + (data.phone || '');
        } else if (data.hasQr && data.qr) {
          document.getElementById('connected-container').classList.add('hidden');
          document.getElementById('qr-container').classList.remove('hidden');
          document.getElementById('qr-image').src = data.qr;
        } else {
          document.getElementById('qr-container').classList.add('hidden');
          document.getElementById('connected-container').classList.add('hidden');
          document.getElementById('loading-spinner').classList.remove('hidden');
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
  connectToWhatsApp().catch((err) => logger.error(err, 'Erreur démarrage WhatsApp'));
});
