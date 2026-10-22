<script lang="ts">
  import { X, Copy, Check, RefreshCw, Key, Terminal, Code, CheckCircle2, AlertTriangle, Sparkles, Bot } from 'lucide-svelte';
  import type { UserKeyInfo } from './api';
  import { regenerateUserKey } from './api';

  interface Props {
    isOpen: boolean;
    keyInfo: UserKeyInfo | null;
    isAuthenticated: boolean;
    onClose: () => void;
    onKeyUpdated: (newKey: string) => void;
  }

  let { isOpen, keyInfo, isAuthenticated, onClose, onKeyUpdated }: Props = $props();

  let activeTab = $state<'claude_code' | 'cursor_aider' | 'curl' | 'python' | 'js'>('claude_code');
  let isRegenerating = $state(false);
  let copyFeedback = $state<string | null>(null);

  function copyToClipboard(text: string, label = 'Copié !') {
    navigator.clipboard.writeText(text);
    copyFeedback = label;
    setTimeout(() => {
      copyFeedback = null;
    }, 2000);
  }

  async function handleRegenerate() {
    if (!keyInfo) return;
    if (!confirm('Êtes-vous sûr de vouloir régénérer votre clé API ? Les anciens scripts devront être mis à jour.')) {
      return;
    }
    isRegenerating = true;
    try {
      const res = await regenerateUserKey(keyInfo.api_key);
      onKeyUpdated(res.api_key);
      copyFeedback = 'Nouvelle clé générée !';
      setTimeout(() => copyFeedback = null, 2500);
    } catch (e: any) {
      alert(`Erreur lors de la régénération: ${e.message}`);
    } finally {
      isRegenerating = false;
    }
  }

  let claudeCodeExample = $derived(() => {
    if (!keyInfo) return '';
    return `# === Utiliser avec Claude Code (Anthropic CLI) ===

# 1. Configurer l'URL de base et votre clé d'API personnelle
export ANTHROPIC_BASE_URL="http://localhost:8080"
export ANTHROPIC_API_KEY="${keyInfo.api_key}"

# 2. Lancer Claude Code
claude`;
  });

  let cursorAiderExample = $derived(() => {
    if (!keyInfo) return '';
    return `# === Utiliser avec Aider, Cursor, Continue, Cline (Format OpenAI) ===

# Option A : Dans un terminal avec Aider :
export OPENAI_API_BASE="http://localhost:8080/v1"
export OPENAI_API_KEY="${keyInfo.api_key}"
aider --model claude-sonnet-4-6

# Option B : Configuration Continue.dev / Cursor / Cline / Roo Code :
# Fournisseur: OpenAI-Compatible
# Base URL:    http://localhost:8080/v1
# API Key:     ${keyInfo.api_key}
# Modèle:      claude-sonnet-4-6 (ou gemini-3.8-flash-high)`;
  });

  let jsExample = $derived(() => {
    if (!keyInfo) return '';
    return `// JavaScript / Node.js
const response = await fetch('http://localhost:8080/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${keyInfo.api_key}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'Bonjour !' }],
    stream: false
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);`;
  });
</script>

{#if isOpen && keyInfo}
  <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
    <div class="bg-[#10131d] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0a0c13]">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-indigo-500/15 text-indigo-400">
            <Key size={18} />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-slate-200">Accès Développeur & Clé API</h3>
            <p class="text-xs text-slate-500">Compatible Claude Code, Cursor, Aider, Continue & OpenAI SDK</p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Google Account Status Banner -->
        <div class="p-3.5 rounded-xl border flex items-center justify-between gap-3 {
          isAuthenticated
            ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
            : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
        }">
          <div class="flex items-center gap-2.5 text-xs">
            {#if isAuthenticated}
              <CheckCircle2 size={16} class="text-emerald-400 shrink-0" />
              <span><strong>Compte Google actif :</strong> Vos outils externes utiliseront directement votre quota personnel Antigravity (Claude Sonnet 4.6, Gemini 3.8 Flash, etc.).</span>
            {:else}
              <AlertTriangle size={16} class="text-amber-400 shrink-0" />
              <span><strong>Compte non connecté :</strong> Connectez votre compte Google via le terminal pour autoriser vos requêtes.</span>
            {/if}
          </div>
        </div>

        <!-- API Key Display Box -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label for="api-key-input" class="text-xs font-semibold text-slate-300">Votre Clé d'API Secrète</label>
            {#if copyFeedback}
              <span class="text-xs font-medium text-emerald-400 flex items-center gap-1">
                <Check size={12} /> {copyFeedback}
              </span>
            {/if}
          </div>

          <div class="flex items-center gap-2">
            <div class="flex-1 relative">
              <input
                id="api-key-input"
                type="text"
                readonly
                value={keyInfo.api_key}
                class="w-full bg-[#0a0c13] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs font-mono text-indigo-300 select-all outline-none"
              />
            </div>
            <button
              type="button"
              onclick={() => copyToClipboard(keyInfo!.api_key, 'Clé copiée !')}
              class="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-lg shadow-indigo-600/20"
            >
              <Copy size={14} />
              <span>Copier</span>
            </button>
            <button
              type="button"
              onclick={handleRegenerate}
              disabled={isRegenerating}
              class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0 border border-slate-700/60"
              title="Régénérer une nouvelle clé"
            >
              <RefreshCw size={14} class={isRegenerating ? 'animate-spin text-indigo-400' : ''} />
            </button>
          </div>
          <p class="text-[11px] text-slate-500">
            En-têtes acceptés : <code class="text-slate-400 bg-slate-900 px-1 py-0.5 rounded font-mono">Authorization: Bearer &lt;clé&gt;</code> ou <code class="text-slate-400 bg-slate-900 px-1 py-0.5 rounded font-mono">x-api-key: &lt;clé&gt;</code>
          </p>
        </div>

        <!-- Code Examples -->
        <div class="space-y-2.5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Code size={14} class="text-blue-400" />
              <span>Connecter vos outils de code préférés</span>
            </div>
            <!-- Tab switches -->
            <div class="flex items-center gap-1 bg-[#0a0c13] p-1 rounded-lg border border-slate-800 text-[11px] overflow-x-auto">
              <button
                type="button"
                onclick={() => activeTab = 'claude_code'}
                class="px-2 py-1 rounded-md transition-all shrink-0 {activeTab === 'claude_code' ? 'bg-indigo-600 text-white font-medium shadow-xs' : 'text-slate-400 hover:text-slate-200'}"
              >
                Claude Code
              </button>
              <button
                type="button"
                onclick={() => activeTab = 'cursor_aider'}
                class="px-2 py-1 rounded-md transition-all shrink-0 {activeTab === 'cursor_aider' ? 'bg-indigo-600 text-white font-medium shadow-xs' : 'text-slate-400 hover:text-slate-200'}"
              >
                Cursor / Aider
              </button>
              <button
                type="button"
                onclick={() => activeTab = 'curl'}
                class="px-2 py-1 rounded-md transition-all shrink-0 {activeTab === 'curl' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}"
              >
                cURL
              </button>
              <button
                type="button"
                onclick={() => activeTab = 'python'}
                class="px-2 py-1 rounded-md transition-all shrink-0 {activeTab === 'python' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}"
              >
                Python
              </button>
              <button
                type="button"
                onclick={() => activeTab = 'js'}
                class="px-2 py-1 rounded-md transition-all shrink-0 {activeTab === 'js' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}"
              >
                JavaScript
              </button>
            </div>
          </div>

          <!-- Code Snippet Display -->
          <div class="relative bg-[#0a0c13] border border-slate-800 rounded-xl p-3.5 overflow-x-auto">
            <button
              type="button"
              onclick={() => {
                let code = '';
                if (activeTab === 'claude_code') code = claudeCodeExample();
                else if (activeTab === 'cursor_aider') code = cursorAiderExample();
                else if (activeTab === 'curl') code = keyInfo!.curl_example;
                else if (activeTab === 'python') code = keyInfo!.python_example;
                else if (activeTab === 'js') code = jsExample();
                copyToClipboard(code, 'Code copié !');
              }}
              class="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium flex items-center gap-1 transition-all"
            >
              <Copy size={12} />
              <span>Copier</span>
            </button>
            <pre class="text-xs font-mono text-slate-300 whitespace-pre leading-relaxed pr-20">{activeTab === 'claude_code' ? claudeCodeExample() : activeTab === 'cursor_aider' ? cursorAiderExample() : activeTab === 'curl' ? keyInfo.curl_example : activeTab === 'python' ? keyInfo.python_example : jsExample()}</pre>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-5 py-3.5 border-t border-slate-800 bg-[#0a0c13] flex justify-end">
        <button
          type="button"
          onclick={onClose}
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
        >
          Fermer
        </button>
      </div>
    </div>
  </div>
{/if}
