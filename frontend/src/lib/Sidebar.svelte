<script lang="ts">
  import type { Conversation, Model } from './types';
  import {
    Plus,
    MessageSquare,
    Settings as SettingsIcon,
    RefreshCw,
    Cpu,
    Terminal,
    Key,
    LogOut,
    Trash2,
    Search,
    Sparkles,
  } from 'lucide-svelte';
  import { filterConversations, formatRelativeDate } from './helpers';

  interface Props {
    conversations: Conversation[];
    currentConversationId: string | null;
    models: Model[];
    selectedModel: string;
    isConnected: boolean;
    isAuthenticated: boolean;
    userEmail: string;
    onSelectConversation: (id: string) => void;
    onNewChat: () => void;
    onSelectModel: (modelId: string) => void;
    onOpenSettings: () => void;
    onOpenTerminal: () => void;
    onOpenApiKeyModal?: () => void;
    onDeleteConversation?: (id: string) => void;
    onClearAllConversations?: () => void;
    onLogout: () => void;
    onRefresh: () => void;
  }

  let {
    conversations = [],
    currentConversationId = null,
    models = [],
    selectedModel = 'gemini-3.8-flash-high',
    isConnected = true,
    userEmail = '',
    onSelectModel,
    onOpenSettings,
    onOpenTerminal,
    onOpenApiKeyModal,
    onDeleteConversation,
    onClearAllConversations,
    onLogout,
    onRefresh,
  }: Props = $props();

  let searchQuery = $state('');

  let filteredConversations = $derived(filterConversations(conversations, searchQuery));
</script>

<aside class="w-76 bg-[#080a10]/95 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col h-full shrink-0 select-none relative z-20 font-sans">
  <!-- Subtle Top Ambient Glow -->
  <div class="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-violet-600/8 to-transparent pointer-events-none"></div>

  <!-- Brand Header -->
  <div class="p-4 border-b border-white/[0.06] flex items-center justify-between relative">
    <div class="flex items-center gap-3">
      <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-xl blur opacity-50 group-hover:opacity-80 transition duration-300"></div>
        <div class="relative w-9 h-9 rounded-xl bg-[#0c0e16] border border-white/15 flex items-center justify-center font-extrabold text-white text-sm tracking-tighter shadow-md">
          <Sparkles size={16} class="text-violet-400" />
        </div>
      </div>
      <div>
        <div class="flex items-center gap-1.5">
          <h1 class="text-sm font-bold text-white tracking-tight leading-none">Antigravity</h1>
          <span class="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25">
            OS
          </span>
        </div>
        <div class="flex items-center gap-1.5 mt-1.5">
          <span class="relative flex h-2 w-2">
            {#if isConnected}
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            {/if}
            <span
              class="relative inline-flex rounded-full h-2 w-2 {isConnected ? 'bg-emerald-400' : 'bg-rose-500'}"
            ></span>
          </span>
          <span class="text-[10px] text-zinc-400 font-medium">
            {isConnected ? 'Node Online' : 'Offline'}
          </span>
        </div>
      </div>
    </div>

    <button
      type="button"
      onclick={onRefresh}
      class="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] text-zinc-400 hover:text-white transition-all cursor-pointer"
      title="Rafraîchir"
    >
      <RefreshCw size={14} />
    </button>
  </div>

  <!-- Primary Action: New Chat Button (Opens in new browser tab) -->
  <div class="px-3.5 pt-3.5 pb-2">
    <a
      href="/?c=new"
      target="_blank"
      onclick={(e) => {
        e.preventDefault();
        window.open('/?c=new', '_blank');
      }}
      class="group relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 bg-[length:200%_auto] hover:bg-right text-white text-xs font-semibold shadow-lg shadow-violet-600/20 border border-white/15 transition-all duration-300 cursor-pointer"
      title="Ouvrir une nouvelle discussion dans un nouvel onglet"
    >
      <span class="flex items-center gap-2">
        <Plus size={15} class="transition-transform group-hover:rotate-90" />
        <span>Nouvelle Session</span>
      </span>
      <span class="flex items-center gap-1 text-[10px] font-mono bg-black/25 px-1.5 py-0.5 rounded-md text-violet-100">
        <span>Agent</span>
        <Sparkles size={10} />
      </span>
    </a>
  </div>

  <!-- Model Selector -->
  <div class="px-3.5 py-2">
    <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
      <label
        for="sidebar-model-select"
        class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5"
      >
        <Cpu size={11} class="text-violet-400" />
        <span>Moteur actif</span>
      </label>
      <select
        id="sidebar-model-select"
        value={selectedModel}
        onchange={(e) => onSelectModel((e.target as HTMLSelectElement).value)}
        class="w-full bg-[#0c0f17] border border-white/[0.08] hover:border-violet-500/40 text-zinc-200 text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-500 transition-colors cursor-pointer"
      >
        {#each models as model}
          <option value={model.id} class="bg-[#0c0f17] text-zinc-200">{model.name}</option>
        {/each}
        {#if models.length === 0}
          <option value="gemini-3.8-flash-high" class="bg-[#0c0f17] text-zinc-200">Gemini 3.8 Flash (High)</option>
          <option value="gemini-3.8-flash-medium" class="bg-[#0c0f17] text-zinc-200">Gemini 3.8 Flash (Medium)</option>
          <option value="gemini-3.8-flash-low" class="bg-[#0c0f17] text-zinc-200">Gemini 3.8 Flash (Low)</option>
        {/if}
      </select>
    </div>
  </div>

  <!-- Search Input -->
  <div class="px-3.5 py-1.5">
    <div class="relative">
      <Search size={13} class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filtrer l'historique..."
        class="w-full bg-white/[0.03] border border-white/[0.06] focus:border-violet-500/50 text-zinc-200 text-xs rounded-xl pl-8 pr-3 py-1.5 placeholder-zinc-500 outline-none transition-all"
      />
    </div>
  </div>

  <!-- Conversation History List (Opens in new browser tab) -->
  <div class="flex-1 overflow-y-auto px-2.5 py-2 space-y-1">
    <div class="px-2 py-1 flex items-center justify-between">
      <span class="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
        Historique ({filteredConversations.length})
      </span>
      {#if conversations.length > 0 && onClearAllConversations}
        <button
          type="button"
          onclick={onClearAllConversations}
          class="text-[10px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1"
          title="Purger l'historique"
        >
          <Trash2 size={11} />
          <span>Purger</span>
        </button>
      {/if}
    </div>

    {#each filteredConversations as conv (conv.conversation_id)}
      <div
        class="group relative flex items-center justify-between w-full rounded-xl transition-all duration-150 {
          currentConversationId === conv.conversation_id
            ? 'bg-violet-500/15 border border-violet-500/30 text-white shadow-xs'
            : 'hover:bg-white/[0.04] text-zinc-300 border border-transparent hover:border-white/[0.05]'
        }"
      >
        <a
          href={`/?c=${conv.conversation_id}`}
          target="_blank"
          onclick={(e) => {
            e.preventDefault();
            window.open(`/?c=${conv.conversation_id}`, '_blank');
          }}
          class="flex-1 min-w-0 p-2.5 flex items-start gap-2.5 text-xs text-left cursor-pointer"
          title={`Ouvrir "${conv.title || conv.preview || 'Session'}" dans un nouvel onglet`}
        >
          <div class="p-1.5 rounded-lg bg-white/[0.04] group-hover:bg-violet-500/15 transition-colors mt-0.5">
            <MessageSquare
              size={12}
              class="shrink-0 {currentConversationId === conv.conversation_id ? 'text-violet-400' : 'text-zinc-500 group-hover:text-violet-300'}"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate leading-snug group-hover:text-white transition-colors">
              {conv.title || conv.preview || 'Session sans titre'}
            </div>
            <div class="text-[10px] text-zinc-500 flex items-center gap-2 mt-1 font-mono">
              <span>{conv.step_count || 1} étapes</span>
              <span>•</span>
              <span>{formatRelativeDate(conv.last_modified_time)}</span>
            </div>
          </div>
        </a>

        {#if onDeleteConversation}
          <button
            type="button"
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDeleteConversation?.(conv.conversation_id);
            }}
            class="p-1.5 mr-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
            title="Supprimer cette discussion"
          >
            <Trash2 size={13} />
          </button>
        {/if}
      </div>
    {/each}

    {#if filteredConversations.length === 0}
      <div class="text-center py-10 px-4">
        <div class="w-8 h-8 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-2 text-zinc-600">
          <MessageSquare size={14} />
        </div>
        <p class="text-xs text-zinc-500">Aucune conversation trouvée</p>
      </div>
    {/if}
  </div>

  <!-- Bottom Control Dock & User Profile -->
  <div class="p-3 border-t border-white/[0.06] bg-[#06070b]/60 space-y-2">
    <div class="grid grid-cols-3 gap-1.5">
      <button
        type="button"
        onclick={onOpenTerminal}
        class="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-zinc-300 hover:text-white text-[10px] font-medium transition-all cursor-pointer"
        title="Terminal Web"
      >
        <Terminal size={14} class="text-cyan-400" />
        <span>Terminal</span>
      </button>

      {#if onOpenApiKeyModal}
        <button
          type="button"
          onclick={onOpenApiKeyModal}
          class="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-zinc-300 hover:text-white text-[10px] font-medium transition-all cursor-pointer"
          title="Clé API & SDK"
        >
          <Key size={14} class="text-violet-400" />
          <span>Clé API</span>
        </button>
      {/if}

      <button
        type="button"
        onclick={onOpenSettings}
        class="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-zinc-300 hover:text-white text-[10px] font-medium transition-all cursor-pointer"
        title="Paramètres & Accès distant"
      >
        <SettingsIcon size={14} class="text-amber-400" />
        <span>Réglages</span>
      </button>
    </div>

    <!-- User Card -->
    <div class="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
          {userEmail ? userEmail.slice(0, 1).toUpperCase() : 'G'}
        </div>
        <div class="truncate text-left min-w-0">
          <div class="font-semibold text-zinc-200 text-xs truncate">
            {userEmail || 'Guillaume'}
          </div>
          <div class="text-[10px] text-emerald-400/90 flex items-center gap-1 font-medium">
            <span>Session isolée</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onclick={onLogout}
        class="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
        title="Se déconnecter"
      >
        <LogOut size={14} />
      </button>
    </div>
  </div>
</aside>
