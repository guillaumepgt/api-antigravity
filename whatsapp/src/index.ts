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
function normalizePhoneNumber(input: string): string {
  let cleaned = (input || '').toString().trim().replace(/\D/g, '');
  // Automatic conversion for French national numbers (e.g. 06..., 07...) -> 336..., 337...
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    cleaned = '33' + cleaned.slice(1);
  }
  return cleaned;
}

const ALLOWED_NUMBERS = (process.env.ALLOWED_NUMBERS || '')
  .split(',')
  .map(normalizePhoneNumber)
  .filter((n) => n.length > 0);
const PAIRING_PHONE = normalizePhoneNumber(process.env.PAIRING_PHONE || process.env.PHONE_NUMBER || '');

let META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
let META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';
let META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'antigravity_token';

// Send message via Meta WhatsApp Cloud API (Graph API)
async function sendMetaWhatsAppMessage(toPhone: string, text: string) {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    logger.warn('Meta credentials non configurés (META_ACCESS_TOKEN ou META_PHONE_NUMBER_ID)');
    return;
  }
  const cleanPhone = normalizePhoneNumber(toPhone);
  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${META_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { preview_url: false, body: chunk },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        logger.error({ err }, 'Erreur envoi message Meta Graph API');
      }
    } catch (e: any) {
      logger.error(e, 'Exception envoi message Meta Graph API');
    }
  }
}

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

const sentMessageIds = new Set<string>();

function markSentMessage(id?: string | null) {
  if (!id) return;
  sentMessageIds.add(id);
  if (sentMessageIds.size > 2000) {
    const first = sentMessageIds.values().next().value;
    if (first) sentMessageIds.delete(first);
  }
}

// Register incoming message handlers on a socket instance
function registerMessageHandler(s: ReturnType<typeof makeWASocket>) {
  s.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      if (msg.key.id && sentMessageIds.has(msg.key.id)) continue;

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

      const myPhone = s?.user?.id?.split(':')[0]?.replace(/\D/g, '') || '';
      const isSelfChat = !isGroup && myPhone && jid.includes(myPhone);

      // In groups: reply if mentioned, if replying to a bot message, or if prefix used
      if (isGroup) {
        const myJid = myPhone ? `${myPhone}@s.whatsapp.net` : '';
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const mentionedMe = myPhone && (mentionedJids.includes(myJid) || mentionedJids.some((j: string) => j.includes(myPhone)));
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant || '';
        const isReplyingToMe = myPhone && quotedParticipant.includes(myPhone);
        const hasPrefix = trimmedText.startsWith('!ai ') || trimmedText.startsWith('!claude ') || trimmedText.startsWith('/ai ') || trimmedText.startsWith('!');

        if (!mentionedMe && !hasPrefix && !isReplyingToMe) {
          continue;
        }
      }

      // In private 1-to-1 chats:
      // If sent from the user to a third-party contact, don't trigger unless prefixed
      if (isFromMe && !isGroup && !isSelfChat) {
        if (!trimmedText.startsWith('!ai ') && !trimmedText.startsWith('!claude ') && !trimmedText.startsWith('! ') && !trimmedText.startsWith('/ai ')) {
          continue;
        }
      }

      // Any message sent TO the bot number (or in self-chat) is answered unconditionally!
      let cleanPrompt = trimmedText
        .replace(/^(!ai|!claude|\/ai)\s+/i, '')
        .replace(/^!\s*/, '')
        .replace(/@\d+\s*/g, '')
        .trim();

      if (cleanPrompt === '/clear' || cleanPrompt === '!clear' || cleanPrompt === '!reset') {
        conversationHistory.delete(jid);
        const sent = await s?.sendMessage(jid, { text: '🧹 *Historique de discussion réinitialisé avec succès !*' }, { quoted: msg });
        if (sent?.key?.id) markSentMessage(sent.key.id);
        continue;
      }

      if (cleanPrompt === '/help' || cleanPrompt === '!help') {
        const helpMsg = `🤖 *Antigravity IA (Claude Sonnet 4.6)*

*Commandes disponibles :*
• Envoyez n'importe quel message pour discuter avec l'IA.
• \`/clear\` : Réinitialise la mémoire de la conversation.
• \`/help\` : Affiche cette aide.

_Vos discussions sont sécurisées et traitées directement sur votre serveur privé._`;
        const sent = await s?.sendMessage(jid, { text: helpMsg }, { quoted: msg });
        if (sent?.key?.id) markSentMessage(sent.key.id);
        continue;
      }

      logger.info(`Message reçu de +${senderPhone} : "${cleanPrompt.slice(0, 50)}..."`);

      try {
        await s?.sendPresenceUpdate('composing', jid);
        const reply = await askAntigravity(jid, cleanPrompt);
        await s?.sendPresenceUpdate('paused', jid);

        const chunks = splitMessage(reply);
        for (const chunk of chunks) {
          const sent = await s?.sendMessage(jid, { text: chunk }, { quoted: msg });
          if (sent?.key?.id) markSentMessage(sent.key.id);
        }
      } catch (err: any) {
        logger.error(err, 'Erreur traitement message');
        await s?.sendPresenceUpdate('paused', jid);
        const sent = await s?.sendMessage(
          jid,
          { text: `⚠️ *Erreur Antigravity* : ${err.message || 'Le serveur n\'a pas pu répondre.'}` },
          { quoted: msg }
        );
        if (sent?.key?.id) markSentMessage(sent.key.id);
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

      if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
        logger.info('Validation WhatsApp réussie (515 restartRequired). Reconnexion immédiate avec les identifiants enregistrés...');
        currentMode = 'qr';
        pairingPhoneTarget = null;
        reconnectTimer = setTimeout(() => {
          startWhatsApp().catch(() => {});
        }, 1500);
      } else if (shouldReconnect) {
        reconnectTimer = setTimeout(() => {
          startWhatsApp().catch(() => {});
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

  // Status API endpoint
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
        meta: {
          configured: !!(META_ACCESS_TOKEN && META_PHONE_NUMBER_ID),
          phoneNumberId: META_PHONE_NUMBER_ID,
          verifyToken: META_VERIFY_TOKEN,
        },
      })
    );
    return;
  }

  // Meta Cloud API configuration endpoint
  if ((url.pathname === '/api/meta-config' || url.pathname === '/whatsapp/api/meta-config') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (typeof data.accessToken === 'string') {
          META_ACCESS_TOKEN = data.accessToken.trim();
        }
        if (typeof data.phoneNumberId === 'string') {
          META_PHONE_NUMBER_ID = data.phoneNumberId.trim();
        }
        if (typeof data.verifyToken === 'string' && data.verifyToken.trim()) {
          META_VERIFY_TOKEN = data.verifyToken.trim();
        }
        logger.info({ configured: !!(META_ACCESS_TOKEN && META_PHONE_NUMBER_ID) }, 'Configuration Meta Cloud API mise à jour');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          configured: !!(META_ACCESS_TOKEN && META_PHONE_NUMBER_ID),
          phoneNumberId: META_PHONE_NUMBER_ID,
        }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API Pairing Code endpoint (No camera needed)
  if ((url.pathname === '/api/pairing-code' || url.pathname === '/whatsapp/api/pairing-code') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const phone = normalizePhoneNumber(data.phoneNumber || '');
        if (!phone || phone.length < 8) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Veuillez saisir un numéro valide (ex: 0766817354 ou 33766817354).' }));
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

  // Meta Webhook Verification (GET)
  if (req.method === 'GET' && (url.pathname === '/meta/webhook' || url.pathname === '/whatsapp/meta/webhook')) {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      logger.info('✅ Webhook Meta Cloud API vérifié avec succès !');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge || '');
      return;
    } else {
      logger.warn(`Échec vérification webhook Meta: token '${token}' != '${META_VERIFY_TOKEN}'`);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
  }

  // Meta Webhook Events (POST)
  if (req.method === 'POST' && (url.pathname === '/meta/webhook' || url.pathname === '/whatsapp/meta/webhook')) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));

      try {
        const payload = JSON.parse(body || '{}');
        const entry = payload.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];

        if (message && message.type === 'text') {
          const fromPhone = message.from;
          const userText = message.text?.body || '';

          if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(normalizePhoneNumber(fromPhone))) {
            logger.info(`Message Meta ignoré de +${fromPhone} (non autorisé)`);
            return;
          }

          logger.info(`Message reçu via Meta Cloud API de +${fromPhone}: "${userText.slice(0, 50)}..."`);
          const reply = await askAntigravity(fromPhone, userText);
          await sendMetaWhatsAppMessage(fromPhone, reply);
        }
      } catch (err: any) {
        logger.error(err, 'Erreur traitement webhook Meta');
      }
    });
    return;
  }

  // HTML page
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity WhatsApp Hub</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0c0e15; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="max-w-xl w-full bg-[#131622] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
    <div class="text-center mb-6">
      <div class="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/20 mb-3">
        💬
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-white mb-1">WhatsApp & Antigravity</h1>
      <p class="text-slate-400 text-sm">Connectez Claude Sonnet 4.6 à WhatsApp</p>
    </div>

    <!-- Navigation Tabs -->
    <div id="tab-nav" class="grid grid-cols-3 p-1 bg-[#0c0e15] border border-slate-800 rounded-2xl mb-6 gap-1 text-center">
      <button id="tab-meta-btn" onclick="setTab('meta')" class="py-2.5 px-2 text-xs font-semibold rounded-xl transition bg-emerald-600 text-white shadow-sm flex items-center justify-center gap-1 cursor-pointer">
        <span>🤖 Meta Chatbot</span>
      </button>
      <button id="tab-code-btn" onclick="setTab('code')" class="py-2.5 px-2 text-xs font-semibold rounded-xl transition text-slate-400 hover:text-white flex items-center justify-center gap-1 cursor-pointer">
        <span>🔢 Code Sans Caméra</span>
      </button>
      <button id="tab-qr-btn" onclick="setTab('qr')" class="py-2.5 px-2 text-xs font-semibold rounded-xl transition text-slate-400 hover:text-white flex items-center justify-center gap-1 cursor-pointer">
        <span>📷 Scanner QR</span>
      </button>
    </div>

    <!-- Main Card Body -->
    <div class="bg-[#1a1e2e] border border-slate-700/60 rounded-2xl p-5 sm:p-6 mb-6">
      
      <!-- ================= TAB 1: META CLOUD API (CHATBOT DÉDIÉ) ================= -->
      <div id="meta-container" class="space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span>🤖 Chatbot Officiel Meta Cloud API</span>
            </h3>
            <p class="text-[11px] text-slate-400">Numéro WhatsApp dédié indépendant de votre téléphone</p>
          </div>
          <span id="meta-status-badge" class="px-2.5 py-1 text-[11px] font-medium rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Vérification...
          </span>
        </div>

        <div class="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-200 leading-relaxed">
          💡 <strong>Le gros avantage de Meta Cloud API :</strong> Vous n'avez pas besoin de connecter votre téléphone personnel. Meta fournit un numéro de chatbot WhatsApp officiel de test. Vous pouvez lui parler directement sur WhatsApp, sans préfixe !
        </div>

        <!-- Configuration Webhook Meta -->
        <div class="bg-[#0c0e15] border border-slate-800 rounded-xl p-4 space-y-3">
          <p class="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
            1. Informations de rappel Webhook (à saisir sur Meta Developers)
          </p>
          
          <div>
            <label class="block text-[11px] text-slate-400 mb-1">URL de rappel (Callback URL) :</label>
            <div class="flex gap-2">
              <input id="meta-webhook-url" readonly type="text" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-300 select-all focus:outline-none" />
              <button onclick="copyToClipboard('meta-webhook-url')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition">
                Copier
              </button>
            </div>
            <p class="text-[10px] text-slate-500 mt-1">⚠️ Meta exige une URL HTTPS publique (votre nom de domaine ou un tunnel Cloudflare / ngrok).</p>
          </div>

          <div>
            <label class="block text-[11px] text-slate-400 mb-1">Jeton de vérification (Verify Token) :</label>
            <div class="flex gap-2">
              <input id="meta-verify-token" readonly value="antigravity_token" type="text" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-300 select-all focus:outline-none" />
              <button onclick="copyToClipboard('meta-verify-token')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition">
                Copier
              </button>
            </div>
          </div>

          <div class="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            ℹ️ Dans Meta Developers &gt; WhatsApp &gt; Configuration Webhook, abonnez-vous au champ <strong class="text-white">messages</strong>.
          </div>
        </div>

        <!-- Meta Credentials Form -->
        <form onsubmit="saveMetaConfig(event)" class="space-y-3">
          <p class="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
            2. Vos identifiants Meta Cloud API
          </p>

          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">Jeton d'accès (Temporary or Permanent Access Token) :</label>
            <input 
              id="meta-access-token" 
              type="password" 
              placeholder="EAAG..." 
              class="w-full px-3.5 py-2 bg-[#0c0e15] border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              required 
            />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">ID de numéro de téléphone (Phone Number ID) :</label>
            <input 
              id="meta-phone-id" 
              type="text" 
              placeholder="Ex: 532187654321..." 
              class="w-full px-3.5 py-2 bg-[#0c0e15] border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              required 
            />
          </div>

          <button 
            id="meta-save-btn" 
            type="submit" 
            class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer"
          >
            Enregistrer la configuration Meta
          </button>
        </form>

        <div class="bg-black/30 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <p class="font-semibold text-slate-300">Comment obtenir ces clés gratuites sur Meta :</p>
          <p>1. Allez sur <a href="https://developers.facebook.com" target="_blank" class="text-emerald-400 underline">developers.facebook.com</a> et connectez-vous.</p>
          <p>2. Créez une application &gt; type <strong>Autre / Entreprise</strong> &gt; ajoutez le produit <strong>WhatsApp</strong>.</p>
          <p>3. Dans <strong>Démarrage rapide</strong>, copiez le Jeton et l'ID du numéro de téléphone.</p>
          <p>4. Ajoutez votre propre numéro dans le champ d'envoi de test (« À ») pour autoriser la réception.</p>
        </div>
      </div>

      <!-- ================= TAB 2: CODE (BAILEYS SANS CAMÉRA) ================= -->
      <div id="code-container" class="hidden space-y-4 text-left">
        <div id="baileys-status-banner" class="hidden bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-emerald-400">✅ Connecté à WhatsApp</p>
            <p id="baileys-connected-phone" class="text-xs text-slate-300 font-mono"></p>
          </div>
          <button onclick="logout()" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs rounded-lg transition border border-rose-500/30">
            Déconnecter
          </button>
        </div>

        <p class="text-xs font-semibold text-emerald-400 uppercase tracking-wider text-center">
          Connexion sans caméra par code à 8 chiffres
        </p>
        <p class="text-xs text-slate-300 leading-relaxed text-center">
          Entrez votre numéro WhatsApp pour générer un code d'association à saisir directement dans l'application.
        </p>

        <form onsubmit="requestCode(event)" class="space-y-3">
          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">Votre numéro mobile (ex: 07 66 81 73 54 ou 33766817354)</label>
            <input 
              id="phone-input" 
              type="tel" 
              placeholder="07 66 81 73 54 ou 33766817354" 
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

        <div id="code-display" class="hidden bg-[#0c0e15] border border-emerald-500/40 rounded-2xl p-4 text-center">
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

      <!-- ================= TAB 3: SCAN QR (BAILEYS) ================= -->
      <div id="qr-container" class="hidden text-center space-y-4">
        <p class="text-xs uppercase font-semibold text-emerald-400 tracking-wider">Scannez avec votre téléphone</p>
        <div class="bg-white p-3 rounded-2xl inline-block shadow-xl">
          <img id="qr-image" src="" alt="QR Code WhatsApp" class="w-56 h-56 mx-auto object-contain" />
        </div>
        <ol class="text-left text-xs text-slate-300 space-y-1.5 bg-black/30 p-3.5 rounded-xl border border-slate-800">
          <li>1. Ouvrez <strong>WhatsApp</strong> sur votre téléphone</li>
          <li>2. Allez dans <strong>Réglages</strong> &gt; <strong>Appareils connectés</strong></li>
          <li>3. Touchez <strong>Connecter un appareil</strong></li>
          <li>4. Pointez votre caméra vers ce code QR</li>
        </ol>
      </div>

    </div>

    <div class="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-4">
      <span>Moteur : Claude Sonnet 4.6</span>
      <a href="/" class="text-indigo-400 hover:underline">← Retour à l'interface Web</a>
    </div>
  </div>

  <script>
    let activeTab = 'meta';

    // Auto-detect and populate webhook URL
    const origin = window.location.origin;
    document.getElementById('meta-webhook-url').value = origin + '/whatsapp/meta/webhook';

    function setTab(tab) {
      activeTab = tab;
      const tabs = ['meta', 'code', 'qr'];
      tabs.forEach(t => {
        const btn = document.getElementById('tab-' + t + '-btn');
        const cont = document.getElementById(t + '-container');
        if (t === tab) {
          btn.className = 'py-2.5 px-2 text-xs font-semibold rounded-xl transition bg-emerald-600 text-white shadow-sm flex items-center justify-center gap-1 cursor-pointer';
          cont.classList.remove('hidden');
        } else {
          btn.className = 'py-2.5 px-2 text-xs font-semibold rounded-xl transition text-slate-400 hover:text-white flex items-center justify-center gap-1 cursor-pointer';
          cont.classList.add('hidden');
        }
      });
    }

    function copyToClipboard(elementId) {
      const el = document.getElementById(elementId);
      navigator.clipboard.writeText(el.value);
      alert('Copié dans le presse-papier !');
    }

    async function saveMetaConfig(e) {
      e.preventDefault();
      const accessToken = document.getElementById('meta-access-token').value;
      const phoneNumberId = document.getElementById('meta-phone-id').value;
      const btn = document.getElementById('meta-save-btn');

      btn.disabled = true;
      btn.innerText = 'Enregistrement...';

      try {
        const res = await fetch('/whatsapp/api/meta-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, phoneNumberId })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ Configuration Meta enregistrée avec succès !');
          updateStatus();
        } else {
          alert('Erreur : ' + (data.error || 'Impossible d\\'enregistrer.'));
        }
      } catch (err) {
        alert('Erreur réseau : ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerText = 'Enregistrer la configuration Meta';
      }
    }

    function normalizePhone(val) {
      let c = (val || '').toString().trim().replace(/\\D/g, '');
      if (c.length === 10 && c.startsWith('0')) {
        c = '33' + c.slice(1);
      }
      return c;
    }

    async function requestCode(e) {
      e.preventDefault();
      const rawInput = document.getElementById('phone-input').value;
      const phone = normalizePhone(rawInput);
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
        
        // Meta status badge
        const badge = document.getElementById('meta-status-badge');
        if (data.meta && data.meta.configured) {
          badge.className = 'px-2.5 py-1 text-[11px] font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
          badge.innerText = '🟢 Actif (' + (data.meta.phoneNumberId ? data.meta.phoneNumberId.slice(-4) : 'OK') + ')';
        } else {
          badge.className = 'px-2.5 py-1 text-[11px] font-medium rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40';
          badge.innerText = '⚠️ Non configuré';
        }

        // Baileys phone connection
        const bBanner = document.getElementById('baileys-status-banner');
        if (data.status === 'connected') {
          bBanner.classList.remove('hidden');
          document.getElementById('baileys-connected-phone').innerText = 'Numéro associé : +' + (data.phone || '');
        } else {
          bBanner.classList.add('hidden');
          if (data.pairingCode) {
            const formatted = data.pairingCode.length === 8 ? data.pairingCode.slice(0, 4) + ' - ' + data.pairingCode.slice(4) : data.pairingCode;
            document.getElementById('pairing-code-text').innerText = formatted;
            document.getElementById('code-display').classList.remove('hidden');
          }
          if (data.hasQr && data.qr) {
            document.getElementById('qr-image').src = data.qr;
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function logout() {
      if (!confirm('Voulez-vous vraiment déconnecter votre WhatsApp personnel ?')) return;
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
