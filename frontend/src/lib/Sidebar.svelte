<script lang="ts">
  import type { Conversation, Model } from './types';
  import { Plus, MessageSquare, Settings as SettingsIcon, Radio, RefreshCw, Cpu, Terminal, Key } from 'lucide-svelte';

  interface Props {
    conversations: Conversation[];
    currentConversationId: string | null;
    models: Model[];
    selectedModel: string;
    isConnected: boolean;
    isAuthenticated: boolean;
    onSelectConversation: (id: string) => void;
    onNewChat: () => void;
    onSelectModel: (modelId: string) => void;
    onOpenSettings: () => void;
    onOpenTerminal: () => void;
    onOpenApiKeyModal?: () => void;
    onRefresh: () => void;
  }

  let {
    conversations,
    currentConversationId,
    models,
    selectedModel,
    isConnected,
    isAuthenticated,
    onSelectConversation,
    onNewChat,
    onSelectModel,
    onOpenSettings,
    onOpenTerminal,
    onOpenApiKeyModal,
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

  <!-- New Chat Button -->
  <div class="p-3">
    <button
      type="button"
      onclick={onNewChat}
      class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
    >
      <Plus size={16} />
      <span>New Conversation</span>
    </button>
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
        <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
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

  <!-- Conversation History List -->
  <div class="flex-1 overflow-y-auto px-2 py-2 space-y-1">
    <div class="px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
      Conversations ({filteredConversations.length})
    </div>

    {#each filteredConversations as conv}
      <button
        type="button"
        onclick={() => onSelectConversation(conv.conversation_id)}
        class="w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 text-xs {
          currentConversationId === conv.conversation_id
            ? 'bg-blue-600/15 border border-blue-500/30 text-blue-200 shadow-sm'
            : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
        }"
      >
        <MessageSquare size={14} class="shrink-0 mt-0.5 {currentConversationId === conv.conversation_id ? 'text-blue-400' : 'text-slate-500'}" />
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate leading-tight">
            {conv.title || conv.preview || 'Untitled conversation'}
          </div>
          <div class="text-[10px] text-slate-500 flex items-center justify-between mt-1">
            <span>{conv.step_count} turns</span>
            <span>{formatDate(conv.last_modified_time)}</span>
          </div>
        </div>
      </button>
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
