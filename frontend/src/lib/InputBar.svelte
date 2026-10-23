<script lang="ts">
  import type { Model } from './types';
  import { Send, Square, ShieldAlert, Sparkles, ChevronDown } from 'lucide-svelte';

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
    modelName = '',
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
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
    }
  }
</script>

<div class="w-full max-w-4xl mx-auto px-4 pb-4">
  <div class="relative bg-[#181c28] border border-slate-800 rounded-2xl shadow-xl transition-all focus-within:border-blue-500/80 focus-within:ring-1 focus-within:ring-blue-500/30">
    <!-- Top toolbar inside input bar -->
    <div class="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-slate-800/60 text-[11px] text-slate-400">
      <div class="flex items-center gap-2">
        {#if onSelectModel && models.length > 0}
          <div class="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#141722] hover:bg-[#1c2132] border border-slate-700/80 hover:border-indigo-500/50 text-indigo-300 hover:text-indigo-200 transition-all cursor-pointer">
            <Sparkles size={12} class="text-indigo-400 shrink-0" />
            <select
              value={selectedModel}
              onchange={(e) => onSelectModel?.((e.target as HTMLSelectElement).value)}
              disabled={isStreaming || disabled}
              class="bg-transparent text-xs font-semibold text-slate-200 outline-none cursor-pointer pr-1"
              title="Changer le modèle d'IA"
            >
              {#each models as m}
                <option value={m.id} class="bg-[#141722] text-slate-200">{m.name}</option>
              {/each}
            </select>
          </div>
        {:else}
          <span class="flex items-center gap-1.5 font-mono text-indigo-400 text-xs">
            <Sparkles size={12} />
            {modelName || 'Modèle par défaut'}
          </span>
        {/if}
      </div>

      {#if dangerMode}
        <span class="inline-flex items-center gap-1 text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/30" title="Tools are auto-approved without manual prompt confirmation">
          <ShieldAlert size={12} />
          Auto-Approve Tools
        </span>
      {/if}
    </div>

    <!-- Textarea -->
    <textarea
      bind:this={textareaEl}
      bind:value={inputPrompt}
      onkeydown={handleKeydown}
      oninput={handleInput}
      placeholder="Message Antigravity... (Shift+Enter for new line)"
      rows={1}
      disabled={disabled}
      class="w-full bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none max-h-48 min-h-[44px]"
    ></textarea>

    <!-- Bottom actions -->
    <div class="flex justify-between items-center px-3 pb-2.5">
      <span class="text-[11px] text-slate-500 hidden sm:inline">
        Press <strong>Enter</strong> to send, <strong>Shift+Enter</strong> for newline
      </span>

      <div class="ml-auto flex items-center gap-2">
        {#if isStreaming}
          <button
            type="button"
            onclick={onStop}
            class="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-all shadow-md shadow-red-500/20"
          >
            <Square size={13} />
            <span>Stop</span>
          </button>
        {:else}
          <button
            type="button"
            onclick={handleSubmit}
            disabled={!inputPrompt.trim() || disabled}
            class="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-all shadow-md shadow-blue-500/20"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
