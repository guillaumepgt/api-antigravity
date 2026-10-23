<script lang="ts">
  import type { Model } from './types';
  import { Send, Square, ShieldAlert, Sparkles } from 'lucide-svelte';

  interface Props {
    isStreaming: boolean;
    disabled?: boolean;
    dangerMode?: boolean;
    models?: Model[];
    selectedModel?: string;
    modelName?: string;
    onSelectModel?: (modelId: string) => void;
    onSend: (text: string) => void;
    onStop: () => void;
  }

  let {
    isStreaming,
    disabled = false,
    dangerMode = true,
    models = [],
    selectedModel = '',
    onSelectModel,
    onSend,
    onStop,
  }: Props = $props();

  let inputPrompt = $state('');
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    const text = inputPrompt.trim();
    if (!text || isStreaming || disabled) return;
    onSend(text);
    inputPrompt = '';
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }

  function handleInput() {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 200)}px`;
    }
  }

  $effect(() => {
    if (!isStreaming && textareaEl) {
      textareaEl.focus();
    }
  });
</script>

<div class="w-full max-w-4xl mx-auto px-3 sm:px-6 pb-4 pt-1 relative z-20 font-sans">
  <div class="relative group">
    <!-- Ambient Focus Halo -->
    <div class="absolute -inset-0.5 bg-gradient-to-r from-violet-600/40 via-indigo-500/30 to-cyan-500/40 rounded-3xl blur opacity-0 group-focus-within:opacity-100 transition duration-300 pointer-events-none"></div>

    <div class="relative glass-panel rounded-2xl shadow-2xl transition-all focus-within:border-violet-500/50 overflow-hidden">
      <!-- Textarea -->
      <textarea
        bind:this={textareaEl}
        bind:value={inputPrompt}
        onkeydown={handleKeydown}
        oninput={handleInput}
        placeholder="Envoyer une instruction à Antigravity... (Entrée pour envoyer, Maj+Entrée pour une ligne)"
        rows={1}
        {disabled}
        class="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-white placeholder-zinc-500 resize-none outline-none max-h-48 min-h-[46px]"
      ></textarea>

      <!-- Bottom Control Bar -->
      <div class="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
        <div class="flex items-center gap-2 flex-wrap">
          {#if onSelectModel && models.length > 0}
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-xs transition-colors">
              <Sparkles size={12} class="text-violet-400 shrink-0" />
              <select
                value={selectedModel}
                onchange={(e) => onSelectModel?.((e.target as HTMLSelectElement).value)}
                disabled={isStreaming || disabled}
                class="bg-transparent text-xs font-semibold text-zinc-200 outline-none cursor-pointer pr-1"
                title="Changer le modèle d'IA"
              >
                {#each models as m}
                  <option value={m.id} class="bg-[#0c0e16] text-zinc-200">
                    {m.name}
                  </option>
                {/each}
              </select>
            </div>
          {:else}
            <span class="inline-flex items-center gap-1.5 font-mono text-violet-300 text-xs px-2.5 py-1 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Sparkles size={12} />
              Gemini 3.8 Flash
            </span>
          {/if}

          {#if dangerMode}
            <span
              class="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300/90 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20"
              title="Exécution automatique des outils activée (--dangerously-skip-permissions)"
            >
              <ShieldAlert size={11} class="text-amber-400" />
              <span class="hidden sm:inline">Auto-Exec</span>
            </span>
          {/if}
        </div>

        <div class="flex items-center gap-2.5">
          <span class="text-[11px] text-zinc-500 hidden md:inline font-mono">
            ⏎ Envoyer
          </span>

          {#if isStreaming}
            <button
              type="button"
              onclick={onStop}
              class="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-rose-600/25 cursor-pointer"
            >
              <Square size={12} />
              <span>Stop</span>
            </button>
          {:else}
            <button
              type="button"
              onclick={handleSubmit}
              disabled={!inputPrompt.trim() || disabled}
              class="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-violet-600/25 cursor-pointer"
            >
              <span>Envoyer</span>
              <Send size={12} />
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
