<script lang="ts">
  import { tick } from 'svelte';
  import MessageItem from './Message.svelte';
  import InputBar from './InputBar.svelte';
  import { chatState } from './state/chatState.svelte';
  import { settingsState } from './state/settingsState.svelte';
  import { terminalState } from './state/terminalState.svelte';
  import { authState } from './state/authState.svelte';
  import {
    ArrowLeft,
    Trash2,
    Terminal,
    Cpu,
    Plus,
    Sparkles,
    Compass,
    Zap,
    Code2,
  } from 'lucide-svelte';

  let chatContainerEl = $state<HTMLDivElement | null>(null);

  async function scrollToBottom() {
    await tick();
    if (chatContainerEl) {
      chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
    }
  }

  $effect(() => {
    // Auto-scroll when new messages arrive or transcript finishes loading
    if (chatState.messages.length > 0 && !chatState.isLoadingTranscript) {
      scrollToBottom();
    }
  });
</script>

<!-- STANDALONE DEDICATED CHAT VIEW -->
<div class="flex-1 flex flex-col h-full w-full bg-[#06070b] bg-cosmic-grid relative overflow-hidden select-text font-sans">
  <div class="pointer-events-none fixed top-[-220px] left-1/2 -translate-x-1/2 w-[650px] h-[340px] bg-violet-600/10 rounded-full blur-[140px]"></div>

  <!-- Floating Glass Header -->
  <header class="sticky top-0 z-20 px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#06070b]/80 backdrop-blur-xl select-none">
    <div class="flex items-center gap-3 min-w-0">
      <button
        type="button"
        onclick={() => chatState.returnToMainTab()}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer shrink-0"
        title="Retourner au Cockpit"
      >
        <ArrowLeft size={13} />
        <span>Cockpit</span>
      </button>

      <div class="h-4 w-[1px] bg-white/[0.08] hidden sm:block"></div>

      <div class="truncate text-xs font-semibold text-zinc-200 hidden sm:block max-w-md">
        {chatState.activeTitle}
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      {#if chatState.currentConversationId}
        <button
          type="button"
          onclick={() => chatState.currentConversationId && chatState.deleteConversation(chatState.currentConversationId)}
          class="p-2 rounded-xl bg-white/[0.03] hover:bg-rose-500/15 border border-white/[0.07] hover:border-rose-500/30 text-zinc-400 hover:text-rose-300 text-xs transition-all cursor-pointer"
          title="Supprimer cette session"
        >
          <Trash2 size={13} />
        </button>
      {/if}

      <button
        type="button"
        onclick={() => terminalState.openUserTerminal()}
        class="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] text-cyan-400 text-xs transition-all cursor-pointer"
        title="Ouvrir le terminal"
      >
        <Terminal size={13} />
      </button>

      <div class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-xs transition-colors">
        <Cpu size={12} class="text-violet-400 shrink-0" />
        <select
          value={settingsState.settings.selectedModel}
          onchange={(e) => settingsState.selectModel((e.target as HTMLSelectElement).value)}
          class="bg-transparent text-xs font-semibold text-zinc-200 outline-none cursor-pointer pr-1"
          title="Changer de modèle ou niveau de réflexion"
        >
          {#each settingsState.models as model}
            <option value={model.id} class="bg-[#0c0e16] text-zinc-200">{model.name}</option>
          {/each}
          {#if settingsState.models.length === 0}
            <option value="gemini-3.8-flash-high" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (High)</option>
            <option value="gemini-3.8-flash-medium" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (Medium)</option>
            <option value="gemini-3.8-flash-low" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (Low)</option>
          {/if}
        </select>
      </div>

      <a
        href="/?c=new"
        target="_blank"
        onclick={(e) => {
          e.preventDefault();
          window.open('/?c=new', '_blank');
        }}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 text-xs font-semibold transition-all cursor-pointer"
        title="Ouvrir un nouveau chat dans un autre onglet"
      >
        <Plus size={13} />
        <span class="hidden sm:inline">Nouvelle Session</span>
      </a>
    </div>
  </header>

  <!-- Message Scroll Area -->
  <div
    bind:this={chatContainerEl}
    class="flex-1 overflow-y-auto px-2 sm:px-4 pt-4 pb-6 scroll-smooth relative z-10"
  >
    {#if chatState.isLoadingTranscript}
      <div class="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400 select-none">
        <div class="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin mb-3"></div>
        <span class="text-xs font-medium text-zinc-300">Chargement de la discussion...</span>
      </div>
    {:else if chatState.messages.length === 0}
      <div class="h-full flex flex-col items-center justify-center text-center px-4 max-w-xl mx-auto select-none my-auto py-12">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-violet-600/25 mb-4 border border-white/20">
          <Sparkles size={26} />
        </div>
        <h3 class="text-xl font-extrabold text-white tracking-tight">
          Session Autonome Prête
        </h3>
        <p class="text-xs sm:text-sm text-zinc-400 mt-2 max-w-md leading-relaxed">
          Posez une question, lancez un script shell ou ordonnez une modification de code. L'agent Antigravity exécutera vos outils en toute fluidité.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-8 w-full text-left">
          <button
            type="button"
            onclick={() => chatState.sendMessage("Explique-moi l’architecture du projet et les technologies utilisées.", scrollToBottom)}
            class="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-violet-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
          >
            <Compass size={15} class="text-violet-400 shrink-0" />
            <span>Expliquer l'architecture du projet</span>
          </button>

          <button
            type="button"
            onclick={() => chatState.sendMessage("Quels outils et MCP sont configurés sur ce nœud ?", scrollToBottom)}
            class="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-cyan-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
          >
            <Zap size={15} class="text-cyan-400 shrink-0" />
            <span>Lister les outils & MCP disponibles</span>
          </button>

          <button
            type="button"
            onclick={() => chatState.sendMessage("Effectue un audit de sécurité et de propreté du code.", scrollToBottom)}
            class="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-emerald-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
          >
            <Code2 size={15} class="text-emerald-400 shrink-0" />
            <span>Auditer la qualité du code</span>
          </button>

          <button
            type="button"
            onclick={() => terminalState.openUserTerminal()}
            class="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-amber-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
          >
            <Terminal size={15} class="text-amber-400 shrink-0" />
            <span>Ouvrir la console shell bash</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="space-y-1">
        {#each chatState.messages as msg (msg.id)}
          <MessageItem message={msg} />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Input Bar (pinned at bottom) -->
  <InputBar
    isStreaming={chatState.isStreaming}
    disabled={!authState.isConnected}
    dangerMode={settingsState.settings.dangerouslySkipPermissions}
    models={settingsState.models}
    selectedModel={settingsState.settings.selectedModel}
    modelName={settingsState.currentModelName}
    onSelectModel={(id) => settingsState.selectModel(id)}
    onSend={(text) => chatState.sendMessage(text, scrollToBottom)}
    onStop={() => chatState.stopGeneration()}
  />
</div>
