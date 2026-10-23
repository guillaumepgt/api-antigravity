<script lang="ts">
  import type { Conversation, Model } from './types';
  import {
    Plus,
    MessageSquare,
    ExternalLink,
    Search,
    RefreshCw,
    Cpu,
    Terminal,
    Key,
    User,
    LogOut,
    Sparkles,
    Settings as SettingsIcon,
    ArrowUpRight,
    Bot,
    Send,
    Clock,
    Trash2,
  } from 'lucide-svelte';

  interface Props {
    conversations: Conversation[];
    models: Model[];
    selectedModel: string;
    isConnected: boolean;
    userEmail: string;
    onSelectModel: (modelId: string) => void;
    onOpenTerminal: () => void;
    onOpenApiKeyModal: () => void;
    onOpenSettings: () => void;
    onDeleteConversation?: (id: string) => void;
    onClearAllConversations?: () => void;
    onLogout: () => void;
    onRefresh: () => void;
  }

  let {
    conversations,
    models,
    selectedModel,
    isConnected,
    userEmail,
    onSelectModel,
    onOpenTerminal,
    onOpenApiKeyModal,
    onOpenSettings,
    onDeleteConversation,
    onClearAllConversations,
    onLogout,
    onRefresh,
  }: Props = $props();

  let searchQuery = $state('');
  let quickPrompt = $state('');

  let userDisplayName = $derived(
    userEmail ? userEmail.split('@')[0] : 'Guillaume'
  );

  let filteredConversations = $derived(
    conversations.filter((c) =>
      (c.title || c.preview || c.conversation_id)
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    )
  );

  function formatRelativeDate(isoStr: string) {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 2) return "À l'instant";
      if (diffMins < 60) return `Il y a ${diffMins} min`;
      if (diffHours < 24 && date.getDate() === now.getDate()) {
        return `Aujourd'hui à ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (diffDays === 1 || (diffHours < 48 && date.getDate() === now.getDate() - 1)) {
        return `Hier à ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  }

  function handleStartQuickPrompt(promptText: string) {
    const text = promptText.trim();
    if (!text) return;
    const url = `/?c=new&q=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    quickPrompt = '';
  }

  function handleQuickPromptKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStartQuickPrompt(quickPrompt);
    }
  }
</script>

<div class="min-h-screen bg-[#0c0e15] text-slate-100 flex flex-col">
  <!-- Top Navigation Bar -->
  <header class="border-b border-slate-800/80 bg-[#0c0e15]/80 backdrop-blur-md sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
      <!-- Left: Logo & Status -->
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-blue-500/20">
          AG
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-100 tracking-tight text-sm sm:text-base">Antigravity</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
              Cockpit
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <span class="w-2 h-2 rounded-full {isConnected ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-red-500'}"></span>
            <span>{isConnected ? 'API Connectée' : 'Hors ligne'}</span>
          </div>
        </div>
      </div>

      <!-- Right: Model, Actions & User Profile -->
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Model Selector Dropdown -->
        <div class="hidden sm:flex items-center gap-1.5 bg-[#141722] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs">
          <Cpu size={13} class="text-indigo-400 shrink-0" />
          <select
            value={selectedModel}
            onchange={(e) => onSelectModel((e.target as HTMLSelectElement).value)}
            class="bg-transparent text-slate-200 outline-none cursor-pointer pr-1"
          >
            {#each models as model}
              <option value={model.id} class="bg-[#141722] text-slate-200">{model.name}</option>
            {/each}
            {#if models.length === 0}
              <option value="gemini-3.8-flash-high" class="bg-[#141722] text-slate-200">Gemini 3.8 Flash</option>
              <option value="claude-sonnet-4-6" class="bg-[#141722] text-slate-200">Claude Sonnet 4.6</option>
            {/if}
          </select>
        </div>

        <!-- WhatsApp Link -->
        <a
          href="/whatsapp/"
          target="_blank"
          rel="noopener noreferrer"
          class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 hover:bg-emerald-900/50 text-emerald-300 text-xs font-medium transition-all shadow-xs"
          title="WhatsApp Bot"
        >
          <MessageSquare size={13} />
          <span>WhatsApp</span>
        </a>

        <!-- Personal Terminal -->
        <button
          type="button"
          onclick={onOpenTerminal}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141722] border border-slate-800 hover:bg-slate-800/60 text-slate-300 text-xs font-medium transition-all cursor-pointer"
          title="Ouvrir le terminal personnel ttyd"
        >
          <Terminal size={13} class="text-blue-400" />
          <span class="hidden sm:inline">Terminal</span>
        </button>

        <!-- API Key -->
        <button
          type="button"
          onclick={onOpenApiKeyModal}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141722] border border-slate-800 hover:bg-slate-800/60 text-slate-300 text-xs font-medium transition-all cursor-pointer"
          title="Clé API"
        >
          <Key size={13} class="text-indigo-400" />
          <span class="hidden sm:inline">Clé API</span>
        </button>

        <!-- Settings -->
        <button
          type="button"
          onclick={onOpenSettings}
          class="p-2 rounded-xl bg-[#141722] border border-slate-800 hover:bg-slate-800/60 text-slate-300 transition-all cursor-pointer"
          title="Paramètres"
        >
          <SettingsIcon size={14} />
        </button>

        <!-- User profile chip & Logout -->
        <div class="flex items-center gap-1.5 pl-2 border-l border-slate-800/80">
          <div class="flex items-center gap-2 bg-[#141722] border border-slate-800/80 rounded-xl px-2.5 py-1 text-xs">
            <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
              {userEmail ? userEmail.slice(0, 1).toUpperCase() : 'G'}
            </div>
            <span class="max-w-[120px] sm:max-w-[160px] truncate font-medium text-slate-200 hidden xs:inline">
              {userEmail || 'Mon Compte'}
            </span>
          </div>

          <button
            type="button"
            onclick={onLogout}
            class="p-2 rounded-xl text-slate-400 hover:text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-900/40 transition-colors cursor-pointer"
            title="Se déconnecter"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
    <!-- Welcome banner & Start new chat -->
    <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#121624] via-[#10131d] to-[#0c0e15] border border-slate-800/80 p-6 sm:p-10 shadow-2xl">
      <!-- Glow ambient background -->
      <div class="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div class="relative z-10 max-w-3xl">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-4">
          <Sparkles size={13} />
          <span>Espace de travail Google Sécurisé</span>
        </div>

        <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
          Bonjour {userDisplayName} 👋
        </h1>
        <p class="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">
          Chaque chat s'ouvre dans un <strong>nouvel onglet dédié</strong> sans aucun bandeau ni distraction, pour une concentration totale.
        </p>

        <!-- Main Action Buttons -->
        <div class="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="/?c=new"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-blue-500/25 transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            <Plus size={18} />
            <span>Nouveau Chat (Nouvel onglet)</span>
            <ExternalLink size={14} class="opacity-70 ml-0.5" />
          </a>
        </div>

        <!-- Quick prompt input box -->
        <div class="mt-6">
          <div class="relative flex items-center bg-[#181c28]/90 border border-slate-700/80 rounded-2xl p-2 shadow-xl focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <textarea
              bind:value={quickPrompt}
              onkeydown={handleQuickPromptKeydown}
              placeholder="Poser une question ou donner une instruction directement..."
              rows={1}
              class="flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none"
            ></textarea>

            <button
              type="button"
              onclick={() => handleStartQuickPrompt(quickPrompt)}
              disabled={!quickPrompt.trim()}
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer shrink-0"
              title="Ouvrir dans un nouvel onglet"
            >
              <span>Lancer le chat</span>
              <Send size={13} />
            </button>
          </div>
        </div>

        <!-- Quick Suggestions -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-5">
          <button
            type="button"
            onclick={() => handleStartQuickPrompt("Explain what is in this workspace and summarize the architecture.")}
            class="text-left p-3 rounded-xl bg-[#141722]/80 border border-slate-800/80 hover:border-blue-500/40 hover:bg-slate-800/40 text-xs text-slate-300 transition-all cursor-pointer group flex items-center justify-between"
          >
            <div>
              <div class="font-medium text-slate-200 group-hover:text-blue-300 transition-colors">🔍 Explorer le projet & workspace</div>
              <div class="text-[11px] text-slate-500">Analyser les fichiers et l'architecture</div>
            </div>
            <ArrowUpRight size={14} class="text-slate-600 group-hover:text-blue-400 transition-colors shrink-0 ml-2" />
          </button>

          <button
            type="button"
            onclick={() => handleStartQuickPrompt("What tools, sidecars and capabilities do you have available?")}
            class="text-left p-3 rounded-xl bg-[#141722]/80 border border-slate-800/80 hover:border-blue-500/40 hover:bg-slate-800/40 text-xs text-slate-300 transition-all cursor-pointer group flex items-center justify-between"
          >
            <div>
              <div class="font-medium text-slate-200 group-hover:text-blue-300 transition-colors">⚡ Capacités & Outils disponibles</div>
              <div class="text-[11px] text-slate-500">Lister les sous-agents, web search, etc.</div>
            </div>
            <ArrowUpRight size={14} class="text-slate-600 group-hover:text-blue-400 transition-colors shrink-0 ml-2" />
          </button>
        </div>
      </div>
    </div>

    <!-- Conversations Hub Section -->
    <div class="space-y-5">
      <!-- Section Header & Search -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <MessageSquare size={18} />
          </div>
          <div>
            <h2 class="text-lg font-bold text-slate-100 tracking-tight">Vos Conversations Récentes</h2>
            <p class="text-xs text-slate-400">
              {filteredConversations.length} conversation{filteredConversations.length > 1 ? 's' : ''} disponible{filteredConversations.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <!-- Search input -->
          <div class="relative w-full sm:w-64">
            <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Rechercher une conversation..."
              class="w-full bg-[#141722] border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <!-- Refresh button -->
          <button
            type="button"
            onclick={onRefresh}
            class="p-2 rounded-xl bg-[#141722] border border-slate-800 hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Rafraîchir la liste"
          >
            <RefreshCw size={15} />
          </button>

          <!-- Clear all conversations button -->
          {#if conversations.length > 0 && onClearAllConversations}
            <button
              type="button"
              onclick={onClearAllConversations}
              class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-900/50 text-red-400 hover:text-red-200 text-xs font-medium transition-all cursor-pointer shadow-xs"
              title="Supprimer définitivement toutes les conversations"
            >
              <Trash2 size={13} />
              <span class="hidden sm:inline">Tout effacer</span>
            </button>
          {/if}
        </div>
      </div>

      <!-- Conversations Cards Grid -->
      {#if filteredConversations.length === 0}
        <div class="p-12 rounded-2xl bg-[#121624]/60 border border-slate-800/80 text-center">
          <div class="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <MessageSquare size={22} />
          </div>
          <h3 class="text-sm font-semibold text-slate-200">
            {searchQuery ? 'Aucune discussion ne correspond à votre recherche' : 'Aucune discussion pour le moment'}
          </h3>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery ? 'Essayez un autre mot-clé ou réinitialisez la recherche.' : 'Démarrez une nouvelle conversation ci-dessus pour poser des questions à Antigravity.'}
          </p>
          {#if !searchQuery}
            <div class="mt-4">
              <a
                href="/?c=new"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-md shadow-blue-500/20"
              >
                <Plus size={14} />
                <span>Ouvrir un nouveau chat</span>
              </a>
            </div>
          {/if}
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each filteredConversations as conv (conv.conversation_id)}
            <a
              href={`/?c=${conv.conversation_id}`}
              target="_blank"
              rel="noopener noreferrer"
              class="group block p-4 rounded-2xl bg-[#121624]/70 hover:bg-[#151a2d] border border-slate-800/80 hover:border-blue-500/50 shadow-md hover:shadow-xl hover:shadow-blue-500/5 transition-all transform hover:-translate-y-0.5 cursor-pointer relative"
            >
              <div class="flex items-start justify-between gap-3 mb-2">
                <div class="flex items-center gap-2 min-w-0">
                  <div class="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                    <MessageSquare size={14} />
                  </div>
                  <h4 class="font-semibold text-xs sm:text-sm text-slate-200 group-hover:text-blue-300 transition-colors truncate">
                    {conv.title || 'Conversation sans titre'}
                  </h4>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  {#if onDeleteConversation}
                    <button
                      type="button"
                      onclick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteConversation?.(conv.conversation_id);
                      }}
                      class="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Supprimer cette discussion"
                    >
                      <Trash2 size={13} />
                    </button>
                  {/if}
                  <div class="p-1.5 rounded-lg text-slate-500 group-hover:text-blue-400 group-hover:bg-blue-500/10 transition-colors">
                    <ExternalLink size={13} />
                  </div>
                </div>
              </div>

              <p class="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4 min-h-[2.5rem]">
                {conv.preview || 'Aucun aperçu disponible'}
              </p>

              <div class="flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-800/60">
                <div class="flex items-center gap-1.5">
                  <Clock size={11} class="text-slate-600" />
                  <span>{formatRelativeDate(conv.last_modified_time)}</span>
                </div>

                {#if conv.step_count}
                  <span class="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 text-[10px] font-mono">
                    {conv.step_count} étape{conv.step_count > 1 ? 's' : ''}
                  </span>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </main>
</div>
