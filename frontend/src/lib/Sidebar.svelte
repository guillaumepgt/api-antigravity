<script lang="ts">
  import type { Conversation, Model } from './types';
  import { Plus, MessageSquare, Settings as SettingsIcon, Radio, RefreshCw, Cpu, Terminal, Key, User, LogOut, ExternalLink, Trash2 } from 'lucide-svelte';

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
    conversations,
    currentConversationId,
    models,
    selectedModel,
    isConnected,
    isAuthenticated,
    userEmail,
    onSelectConversation,
    onNewChat,
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

  let filteredConversations = $derived(
    conversations.filter(c =>
      (c.title || c.preview || c.conversation_id)
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    )
  );

  function formatDate(isoStr: string) {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }
</script>

<aside class="w-72 bg-[#0c0e15] border-r border-slate-800/80 flex flex-col h-full shrink-0 select-none">
  <!-- Brand Header -->
  <div class="p-4 border-b border-slate-800/60 flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-base shadow-md shadow-blue-500/20">
        AG
      </div>
      <div>
        <h1 class="text-sm font-semibold text-slate-100 tracking-tight leading-none">Antigravity</h1>
        <div class="flex items-center gap-1.5 mt-1">
          <span class="w-2 h-2 rounded-full {isConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-red-500'}"></span>
          <span class="text-[10px] text-slate-400 font-medium">
            {isConnected ? 'API Connected' : 'Offline / Error'}
          </span>
        </div>
      </div>
    </div>

    <button
      type="button"
      onclick={onRefresh}
      class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
      title="Refresh list"
    >
      <RefreshCw size={15} />
    </button>
  </div>

  <!-- Authenticated User Card -->
  <div class="px-3 py-2 border-b border-slate-800/60">
    <div class="w-full p-2.5 rounded-xl bg-[#141722] border border-slate-800 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
          {userEmail ? userEmail.slice(0, 1).toUpperCase() : 'G'}
        </div>
        <div class="truncate text-left min-w-0">
          <div class="font-medium text-slate-200 truncate">{userEmail || 'Mon Compte Google'}</div>
          <div class="text-[10px] text-emerald-400 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Espace privé</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onclick={onLogout}
        class="p-1.5 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-950/40 transition-colors cursor-pointer"
        title="Se déconnecter de cette session"
      >
        <LogOut size={14} />
      </button>
    </div>
  </div>

  <!-- New Chat Button (Opens in new browser tab) -->
  <div class="p-3">
    <a
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
      title="Ouvrir une nouvelle discussion dans un nouvel onglet de navigateur"
    >
      <Plus size={16} />
      <span>New Chat (Nouvel onglet)</span>
      <ExternalLink size={12} class="opacity-60" />
    </a>
  </div>

  <!-- Model Selector Dropdown -->
  <div class="px-3 pb-2">
    <label for="model-select" class="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
      <Cpu size={12} class="text-indigo-400" />
      Model
    </label>
    <select
      id="model-select"
      value={selectedModel}
      onchange={(e) => onSelectModel((e.target as HTMLSelectElement).value)}
      class="w-full bg-[#181c28] border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 transition-colors cursor-pointer"
    >
      {#each models as model}
        <option value={model.id}>{model.name}</option>
      {/each}
      {#if models.length === 0}
        <option value="gemini-3.8-flash-high">Gemini 3.8 Flash (High)</option>
        <option value="gemini-3.8-flash-medium">Gemini 3.8 Flash (Medium)</option>
        <option value="gemini-3.8-flash-low">Gemini 3.8 Flash (Low)</option>
      {/if}
    </select>
  </div>

  <!-- Search input -->
  <div class="px-3 py-1">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search history..."
      class="w-full bg-[#141722] border border-slate-800/80 text-slate-300 text-xs rounded-lg px-3 py-1.5 placeholder-slate-500 outline-none focus:border-slate-700"
    />
  </div>

  <!-- Conversation History List (Opens in new browser tab) -->
  <div class="flex-1 overflow-y-auto px-2 py-2 space-y-1">
    <div class="px-2 py-1 flex items-center justify-between">
      <span class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        Conversations ({filteredConversations.length})
      </span>
      {#if conversations.length > 0 && onClearAllConversations}
        <button
          type="button"
          onclick={onClearAllConversations}
          class="text-[10px] text-slate-500 hover:text-red-400 transition-colors cursor-pointer flex items-center gap-1"
          title="Supprimer définitivement toutes les conversations"
        >
          <Trash2 size={11} />
          <span>Effacer</span>
        </button>
      {/if}
    </div>

    {#each filteredConversations as conv}
      <div
        class="group relative flex items-center justify-between w-full rounded-xl transition-all {
          currentConversationId === conv.conversation_id
            ? 'bg-blue-600/15 border border-blue-500/30 text-blue-200 shadow-sm'
            : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
        }"
      >
        <a
          href={`/?c=${conv.conversation_id}`}
          target="_blank"
          rel="noopener noreferrer"
          class="flex-1 min-w-0 p-2.5 flex items-start gap-2.5 text-xs"
          title={`Ouvrir "${conv.title || conv.preview || 'Discussion'}" dans un nouvel onglet`}
        >
          <MessageSquare size={14} class="shrink-0 mt-0.5 {currentConversationId === conv.conversation_id ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}" />
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate leading-tight group-hover:text-white">
              {conv.title || conv.preview || 'Untitled conversation'}
            </div>
            <div class="text-[10px] text-slate-500 flex items-center justify-between mt-1">
              <span>{conv.step_count} turns</span>
              <span>{formatDate(conv.last_modified_time)}</span>
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
            class="p-1.5 mr-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
            title="Supprimer cette discussion"
          >
            <Trash2 size={13} />
          </button>
        {/if}
      </div>
    {/each}

    {#if filteredConversations.length === 0}
      <div class="text-center py-8 text-xs text-slate-500">
        No conversations found
      </div>
    {/if}
  </div>

  <!-- Footer / Terminal & Settings Buttons -->
  <div class="p-3 border-t border-slate-800/60 flex flex-col gap-1.5">
    <button
      type="button"
      onclick={onOpenTerminal}
      class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 {isAuthenticated ? 'text-slate-300' : 'bg-amber-950/40 text-amber-300 border border-amber-800/40'} text-xs font-medium transition-colors w-full cursor-pointer"
      title="Ouvrir le terminal pour se connecter avec Google"
    >
      <Terminal size={15} />
      <span>{isAuthenticated ? 'Terminal Web' : 'Connecter Compte Google'}</span>
    </button>

    <button
      type="button"
      onclick={onOpenApiKeyModal}
      class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors w-full cursor-pointer"
      title="Afficher ma clé API et exemples curl/python"
    >
      <Key size={15} class="text-indigo-400" />
      <span>Clé API Développeur</span>
    </button>

    <button
      type="button"
      onclick={onOpenSettings}
      class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors w-full cursor-pointer"
    >
      <SettingsIcon size={15} />
      <span>Settings & Remote</span>
    </button>
  </div>
</aside>
