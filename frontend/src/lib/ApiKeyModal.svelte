<script lang="ts">
  import {
    X,
    Copy,
    Check,
    RefreshCw,
    Key,
    Code,
    CheckCircle2,
    Eye,
    EyeOff,
  } from 'lucide-svelte';
  import { generateSnippet } from './helpers';
  import { regenerateUserKey } from './api';

  interface KeyInfo {
    api_key: string;
    created_at?: string;
    curl_example?: string;
    python_example?: string;
    js_example?: string;
  }

  interface Props {
    isOpen: boolean;
    keyInfo: KeyInfo | null;
    onClose: () => void;
    onKeyUpdated?: (newKey: string) => void;
  }

  let {
    isOpen,
    keyInfo,
    onClose,
    onKeyUpdated,
  }: Props = $props();

  let activeTab = $state<'claude_code' | 'cursor_aider' | 'curl' | 'python' | 'js'>('claude_code');
  let isRegenerating = $state(false);
  let copyFeedback = $state<string | null>(null);
  let showKey = $state(false);

  let apiKeyVal = $derived(keyInfo?.api_key || '');
  let currentSnippet = $derived(generateSnippet(activeTab, apiKeyVal));

  async function copyToClipboard(text: string, label = 'Copié !') {
    try {
      await navigator.clipboard.writeText(text);
      copyFeedback = label;
      setTimeout(() => (copyFeedback = null), 2000);
    } catch {}
  }

  async function handleRegenerate() {
    if (!confirm('Êtes-vous sûr de vouloir régénérer votre clé API ? Les anciens scripts devront être mis à jour.')) {
      return;
    }
    isRegenerating = true;
    try {
      const res = await regenerateUserKey();
      if (res?.api_key) {
        onKeyUpdated?.(res.api_key);
        copyFeedback = 'Nouvelle clé générée !';
        setTimeout(() => (copyFeedback = null), 2500);
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la régénération');
    } finally {
      isRegenerating = false;
    }
  }

  const tabs: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'claude_code', label: 'Claude Code' },
    { id: 'cursor_aider', label: 'Cursor / Aider' },
    { id: 'curl', label: 'cURL' },
    { id: 'python', label: 'Python' },
    { id: 'js', label: 'JS' },
  ];
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 font-sans">
    <div class="bg-[#0b0d14] border border-white/[0.08] rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-[#080a10]">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/20">
            <Key size={18} />
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">Portail Développeur & Clé API</h3>
            <p class="text-xs text-zinc-500">
              Passerelle compatible Anthropic Messages & OpenAI Chat Completions
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1.5 rounded-xl hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-5">
        <div class="p-3.5 rounded-2xl border flex items-center justify-between gap-3 bg-emerald-500/10 border-emerald-500/25 text-emerald-300">
          <div class="flex items-center gap-2.5 text-xs leading-relaxed">
            <CheckCircle2 size={16} class="text-emerald-400 shrink-0" />
            <span>
              <strong>Quota Google Cloud actif :</strong> Vos outils externes (Claude Code, Cursor, Aider) peuvent utiliser le proxy local Antigravity sans configuration complexe.
            </span>
          </div>
        </div>

        <!-- Secret Key Input -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label for="api-key-input" class="text-xs font-semibold text-zinc-300">
              Votre Clé Secrète Personnelle
            </label>
            {#if copyFeedback}
              <span class="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <Check size={12} /> {copyFeedback}
              </span>
            {/if}
          </div>

          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                readonly
                value={apiKeyVal}
                class="w-full bg-[#050609] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs font-mono text-violet-300 select-all outline-none pr-10"
              />
              <button
                type="button"
                onclick={() => (showKey = !showKey)}
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                title={showKey ? 'Masquer' : 'Afficher'}
              >
                {#if showKey}
                  <EyeOff size={14} />
                {:else}
                  <Eye size={14} />
                {/if}
              </button>
            </div>

            <button
              type="button"
              onclick={() => copyToClipboard(apiKeyVal, 'Clé copiée !')}
              class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-lg shadow-violet-600/20"
            >
              <Copy size={14} />
              <span>Copier</span>
            </button>

            <button
              type="button"
              onclick={handleRegenerate}
              disabled={isRegenerating}
              class="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0 border border-white/[0.08]"
              title="Régénérer une nouvelle clé"
            >
              <RefreshCw size={14} class={isRegenerating ? 'animate-spin text-violet-400' : ''} />
            </button>
          </div>
        </div>

        <!-- Integration Snippets -->
        <div class="space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Code size={14} class="text-cyan-400" />
              <span>Exemples d'intégration rapide</span>
            </div>
            <div class="flex items-center gap-1 bg-[#050609] p-1 rounded-xl border border-white/[0.07] text-[11px] overflow-x-auto">
              {#each tabs as tab}
                <button
                  type="button"
                  onclick={() => (activeTab = tab.id)}
                  class="px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer {activeTab === tab.id ? 'bg-violet-600 text-white font-semibold' : 'text-zinc-400 hover:text-white'}"
                >
                  {tab.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="relative bg-[#050609] border border-white/[0.08] rounded-2xl p-4 overflow-x-auto">
            <button
              type="button"
              onclick={() => copyToClipboard(currentSnippet, 'Snippet copié !')}
              class="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-violet-600 text-zinc-300 hover:text-white text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
            >
              <Copy size={12} />
              <span>Copier</span>
            </button>
            <pre class="text-xs font-mono text-zinc-300 whitespace-pre leading-relaxed pr-20">{currentSnippet}</pre>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-white/[0.06] bg-[#080a10] flex justify-end">
        <button
          type="button"
          onclick={onClose}
          class="px-5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
        >
          Fermer
        </button>
      </div>
    </div>
  </div>
{/if}
