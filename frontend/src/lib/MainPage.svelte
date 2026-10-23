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
    Sparkles,
    Settings as SettingsIcon,
    ArrowUpRight,
    Send,
    Clock,
    Trash2,
    LayoutGrid,
    List,
    Code2,
    Layers,
    Compass,
    Zap,
    LogOut,
  } from 'lucide-svelte';
  import { filterConversations, formatRelativeDate } from './helpers';

  interface Props {
    conversations: Conversation[];
    models: Model[];
    selectedModel: string;
    isConnected: boolean;
    isAuthenticated: boolean;
    userEmail: string;
    onSelectConversation?: (id: string) => void;
    onNewChat?: () => void;
    onSelectModel: (modelId: string) => void;
    onOpenTerminal: () => void;
    onOpenApiKeyModal: () => void;
    onOpenSettings: () => void;
    onDeleteConversation?: (id: string) => void;
    onClearAllConversations?: () => void;
    onLogout: () => void;
    onRefresh: () => void;
    onToggleMobileSidebar?: () => void;
  }

  let {
    conversations = [],
    models = [],
    selectedModel = 'gemini-3.8-flash-high',
    isConnected = true,
    userEmail = '',
    onSelectModel,
    onOpenTerminal,
    onOpenApiKeyModal,
    onOpenSettings,
    onDeleteConversation,
    onClearAllConversations,
    onLogout,
    onRefresh,
    onToggleMobileSidebar,
  }: Props = $props();

  let searchQuery = $state('');
  let quickPrompt = $state('');
  let viewMode = $state<'grid' | 'list'>('grid');

  let userDisplayName = $derived(
    userEmail
      ? userEmail.split('@')[0].split('.')[0].replace(/^\w/, (c) => c.toUpperCase())
      : 'Guillaume'
  );

  let filteredConversations = $derived(filterConversations(conversations, searchQuery));

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

  const quickTemplates = [
    {
      icon: Compass,
      title: 'Architecture & Workspace',
      subtitle: 'Analyser la structure du projet, les dépendances et résumer les composants',
      prompt: 'Explique-moi ce qui se trouve dans cet espace de travail et résume l’architecture du projet.',
      color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    },
    {
      icon: Zap,
      title: 'Outils & Capacités Agent',
      subtitle: 'Lister les MCP, sidecars, commandes bash et outils d’automatisation',
      prompt: 'Quels sont les outils, MCP, sidecars et capacités d’exécution disponibles ?',
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    },
    {
      icon: Code2,
      title: 'Audit & Refactoring',
      subtitle: 'Inspecter les derniers fichiers modifiés et suggérer des optimisations de code',
      prompt: 'Vérifie le statut git ou les fichiers modifiés et propose des améliorations de qualité.',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
  ];
</script>

<div class="min-h-full bg-[#06070b] bg-cosmic-grid text-zinc-100 flex flex-col relative overflow-x-hidden font-sans">
  <!-- Ambient Background Spotlights -->
  <div class="pointer-events-none fixed top-[-180px] left-[25%] w-[600px] h-[420px] bg-violet-600/12 rounded-full blur-[130px]"></div>
  <div class="pointer-events-none fixed bottom-[-200px] right-[10%] w-[500px] h-[400px] bg-cyan-500/8 rounded-full blur-[130px]"></div>

  <!-- Top Navigation Header -->
  <header class="border-b border-white/[0.06] bg-[#06070b]/75 backdrop-blur-xl sticky top-0 z-30">
    <div class="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
      <!-- Left: Mobile Brand / Status Breadcrumb -->
      <div class="flex items-center gap-3">
        {#if onToggleMobileSidebar}
          <button
            type="button"
            onclick={onToggleMobileSidebar}
            class="md:hidden p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 cursor-pointer"
            title="Menu"
          >
            <Layers size={16} class="text-violet-400" />
          </button>
        {/if}
        <div class="flex items-center gap-2.5">
          <span class="text-xs font-semibold text-zinc-400 hidden sm:inline">Workspace</span>
          <span class="text-zinc-700 hidden sm:inline">/</span>
          <span class="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
            <Layers size={14} class="text-violet-400 hidden sm:inline" />
            Cockpit Principal
          </span>
          <span class="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.07] text-zinc-300">
            <span
              class="w-1.5 h-1.5 rounded-full {isConnected ? 'bg-emerald-400' : 'bg-rose-500'}"
            ></span>
            {isConnected ? 'API Prête' : 'Hors ligne'}
          </span>
        </div>
      </div>

      <!-- Right: Quick Actions Bar -->
      <div class="flex items-center gap-2">
        <!-- Model Pill -->
        <div class="hidden sm:flex items-center gap-1.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs transition-colors">
          <Cpu size={13} class="text-violet-400 shrink-0" />
          <select
            value={selectedModel}
            onchange={(e) => onSelectModel((e.target as HTMLSelectElement).value)}
            class="bg-transparent text-zinc-200 font-medium outline-none cursor-pointer pr-1"
            title="Changer de modèle"
          >
            {#each models as model}
              <option value={model.id} class="bg-[#0c0e16] text-zinc-200">{model.name}</option>
            {/each}
            {#if models.length === 0}
              <option value="gemini-3.8-flash-high" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (High)</option>
              <option value="gemini-3.8-flash-medium" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (Medium)</option>
              <option value="gemini-3.8-flash-low" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (Low)</option>
            {/if}
          </select>
        </div>

        <!-- WhatsApp Bridge link -->
        <a
          href="https://web.whatsapp.com"
          target="_blank"
          rel="noopener noreferrer"
          class="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition-all cursor-pointer"
          title="Passerelle WhatsApp"
        >
          <MessageSquare size={13} />
          <span>WhatsApp</span>
        </a>

        <!-- Terminal -->
        <button
          type="button"
          onclick={onOpenTerminal}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.07] text-zinc-200 text-xs font-medium transition-all cursor-pointer"
          title="Ouvrir le terminal web"
        >
          <Terminal size={13} class="text-cyan-400" />
          <span class="hidden sm:inline">Terminal</span>
        </button>

        <!-- API Key -->
        <button
          type="button"
          onclick={onOpenApiKeyModal}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.07] text-zinc-200 text-xs font-medium transition-all cursor-pointer"
          title="Clé API & Intégrations"
        >
          <Key size={13} class="text-violet-400" />
          <span class="hidden sm:inline">API</span>
        </button>

        <!-- Settings -->
        <button
          type="button"
          onclick={onOpenSettings}
          class="p-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.07] text-zinc-300 hover:text-white transition-all cursor-pointer"
          title="Paramètres"
        >
          <SettingsIcon size={14} />
        </button>

        <!-- User profile & Logout -->
        <div class="flex items-center gap-1 pl-1 sm:pl-2 border-l border-white/[0.08]">
          <div class="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.08] rounded-xl px-2.5 py-1 text-xs">
            <div class="w-5 h-5 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
              {userEmail ? userEmail.slice(0, 1).toUpperCase() : 'G'}
            </div>
            <span class="max-w-[100px] sm:max-w-[130px] truncate font-medium text-zinc-200 hidden xs:inline text-[11px]">
              {userDisplayName}
            </span>
          </div>
          <button
            type="button"
            onclick={onLogout}
            class="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="Se déconnecter"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content Container -->
  <main class="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-10 relative z-10">
    <!-- Hero Command Center -->
    <section class="relative rounded-3xl glass-panel p-6 sm:p-10 overflow-hidden">
      <div class="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-violet-600/20 via-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>

      <div class="relative z-10 max-w-3xl space-y-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs font-medium">
          <Sparkles size={12} class="text-violet-400" />
          <span>Agent Autonome • Multi-Onglets Isolés</span>
        </div>

        <div class="space-y-2">
          <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Bonjour,{' '}
            <span class="bg-gradient-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-transparent">
              {userDisplayName}
            </span>
          </h1>
          <p class="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Lancez une instruction ci-dessous ou ouvrez une session dédiée. Chaque tâche s'exécute dans un environnement fluide et autonome.
          </p>
        </div>

        <!-- Spotlight Command Input -->
        <div class="relative group">
          <div class="absolute -inset-0.5 bg-gradient-to-r from-violet-600/50 via-indigo-500/40 to-cyan-500/50 rounded-2xl blur opacity-30 group-focus-within:opacity-75 transition duration-300 pointer-events-none"></div>
          <div class="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-[#090b11] border border-white/[0.1] group-focus-within:border-violet-500/60 rounded-2xl p-2.5 shadow-2xl transition-all">
            <textarea
              bind:value={quickPrompt}
              onkeydown={handleQuickPromptKeydown}
              placeholder="Décrivez une tâche, posez une question ou lancez un audit de code..."
              rows={2}
              class="flex-1 bg-transparent px-3 py-1.5 text-sm text-white placeholder-zinc-500 resize-none outline-none"
            ></textarea>

            <div class="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
              <a
                href="/?c=new"
                target="_blank"
                onclick={(e) => {
                  e.preventDefault();
                  window.open('/?c=new', '_blank');
                }}
                class="px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                title="Ouvrir une session vierge"
              >
                <Plus size={14} />
                <span>Session vierge</span>
              </a>

              <button
                type="button"
                onclick={() => handleStartQuickPrompt(quickPrompt)}
                disabled={!quickPrompt.trim()}
                class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-35 text-white text-xs font-semibold shadow-lg shadow-violet-600/25 transition-all cursor-pointer shrink-0"
              >
                <span>Exécuter</span>
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>

        <!-- Bento Starter Templates -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {#each quickTemplates as item}
            {@const IconComponent = item.icon}
            <button
              type="button"
              onclick={() => handleStartQuickPrompt(item.prompt)}
              class="group text-left p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-violet-500/30 transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3"
            >
              <div class="flex items-center justify-between w-full">
                <div class="p-2 rounded-xl border {item.color}">
                  <IconComponent size={15} />
                </div>
                <ArrowUpRight
                  size={14}
                  class="text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                />
              </div>
              <div>
                <div class="font-semibold text-xs text-zinc-200 group-hover:text-white transition-colors">
                  {item.title}
                </div>
                <div class="text-[11px] text-zinc-500 line-clamp-2 mt-0.5 leading-snug">
                  {item.subtitle}
                </div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </section>

    <!-- Conversations Directory Section -->
    <section class="space-y-5">
      <!-- Toolbar: Title, Search, View Switcher, Clear -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <MessageSquare size={17} />
          </div>
          <div>
            <h2 class="text-base font-bold text-white tracking-tight">Sessions de travail</h2>
            <p class="text-xs text-zinc-500">
              {filteredConversations.length} conversation{filteredConversations.length > 1 ? 's' : ''} enregistrée{filteredConversations.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <!-- Search Box -->
          <div class="relative flex-1 sm:flex-initial sm:w-64">
            <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Rechercher une session..."
              class="w-full bg-white/[0.03] border border-white/[0.07] focus:border-violet-500/50 text-zinc-200 text-xs rounded-xl pl-9 pr-3 py-2 placeholder-zinc-500 outline-none transition-all"
            />
          </div>

          <!-- View Switcher (Grid / List) -->
          <div class="flex items-center bg-white/[0.03] p-1 rounded-xl border border-white/[0.07]">
            <button
              type="button"
              onclick={() => (viewMode = 'grid')}
              class="p-1.5 rounded-lg transition-all cursor-pointer {viewMode === 'grid' ? 'bg-violet-600 text-white shadow-xs' : 'text-zinc-400 hover:text-white'}"
              title="Vue Grille"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              type="button"
              onclick={() => (viewMode = 'list')}
              class="p-1.5 rounded-lg transition-all cursor-pointer {viewMode === 'list' ? 'bg-violet-600 text-white shadow-xs' : 'text-zinc-400 hover:text-white'}"
              title="Vue Liste"
            >
              <List size={13} />
            </button>
          </div>

          <!-- Refresh -->
          <button
            type="button"
            onclick={onRefresh}
            class="p-2 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.07] text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Actualiser"
          >
            <RefreshCw size={14} />
          </button>

          <!-- Clear All -->
          {#if conversations.length > 0 && onClearAllConversations}
            <button
              type="button"
              onclick={onClearAllConversations}
              class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium transition-all cursor-pointer"
              title="Tout supprimer"
            >
              <Trash2 size={13} />
              <span class="hidden sm:inline">Purger</span>
            </button>
          {/if}
        </div>
      </div>

      <!-- Empty State -->
      {#if filteredConversations.length === 0}
        <div class="p-14 rounded-3xl glass-panel text-center max-w-lg mx-auto my-4">
          <div class="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mx-auto mb-4">
            <MessageSquare size={22} />
          </div>
          <h3 class="text-sm font-bold text-white">
            {searchQuery ? 'Aucun résultat pour cette recherche' : 'Aucune session active'}
          </h3>
          <p class="text-xs text-zinc-500 mt-1.5 leading-relaxed">
            {searchQuery
              ? 'Essayez avec d’autres termes ou effacez le filtre.'
              : 'Démarrez votre première session avec Antigravity en utilisant la barre de commande ci-dessus.'}
          </p>
        </div>
      {:else if viewMode === 'grid'}
        <!-- Grid View -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each filteredConversations as conv (conv.conversation_id)}
            <a
              href={`/?c=${conv.conversation_id}`}
              target="_blank"
              onclick={(e) => {
                e.preventDefault();
                window.open(`/?c=${conv.conversation_id}`, '_blank');
              }}
              class="group flex flex-col justify-between p-5 rounded-2xl glass-panel hover:bg-white/[0.04] hover:border-violet-500/40 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer relative overflow-hidden"
            >
              <div>
                <div class="flex items-start justify-between gap-3 mb-3">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                      <MessageSquare size={14} />
                    </div>
                    <h4 class="font-bold text-sm text-zinc-100 group-hover:text-white transition-colors truncate">
                      {conv.title || 'Session sans titre'}
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
                        class="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    {/if}
                    <div class="p-1.5 rounded-lg text-zinc-500 group-hover:text-violet-400 transition-colors">
                      <ExternalLink size={13} />
                    </div>
                  </div>
                </div>

                <p class="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4 min-h-[2.5rem]">
                  {conv.preview || 'Aucun aperçu disponible pour cette session.'}
                </p>
              </div>

              <div class="flex items-center justify-between text-[11px] text-zinc-500 pt-3 border-t border-white/[0.06] font-mono">
                <div class="flex items-center gap-1.5">
                  <Clock size={11} class="text-zinc-600" />
                  <span>{formatRelativeDate(conv.last_modified_time)}</span>
                </div>

                {#if conv.step_count}
                  <span class="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-300 text-[10px]">
                    {conv.step_count} tour{conv.step_count > 1 ? 's' : ''}
                  </span>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      {:else}
        <!-- Compact List View -->
        <div class="rounded-2xl glass-panel divide-y divide-white/[0.06] overflow-hidden">
          {#each filteredConversations as conv (conv.conversation_id)}
            <a
              href={`/?c=${conv.conversation_id}`}
              target="_blank"
              onclick={(e) => {
                e.preventDefault();
                window.open(`/?c=${conv.conversation_id}`, '_blank');
              }}
              class="group flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              <div class="flex items-center gap-3.5 min-w-0 flex-1">
                <div class="p-2 rounded-xl bg-violet-500/10 text-violet-400 shrink-0">
                  <MessageSquare size={14} />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-semibold text-xs sm:text-sm text-zinc-100 group-hover:text-violet-300 truncate transition-colors">
                    {conv.title || 'Session sans titre'}
                  </div>
                  <div class="text-xs text-zinc-500 truncate mt-0.5">
                    {conv.preview || 'Aucun aperçu'}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-3 shrink-0 text-xs font-mono text-zinc-500">
                {#if conv.step_count}
                  <span class="hidden sm:inline px-2 py-0.5 rounded bg-white/[0.04] text-[10px] text-zinc-400">
                    {conv.step_count} étapes
                  </span>
                {/if}
                <span class="text-[11px]">{formatRelativeDate(conv.last_modified_time)}</span>
                {#if onDeleteConversation}
                  <button
                    type="button"
                    onclick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeleteConversation?.(conv.conversation_id);
                    }}
                    class="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                {/if}
                <ExternalLink size={13} class="text-zinc-600 group-hover:text-violet-400" />
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </main>
</div>
