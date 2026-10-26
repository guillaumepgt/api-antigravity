import React, { useState, useMemo } from 'react';
import type { Conversation, Model } from '../lib/types';
import {
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Terminal,
  Settings as SettingsIcon,
  Key,
  Cpu,
  Clock,
  ExternalLink,
  RefreshCw,
  LayoutGrid,
  List,
  Send,
  ArrowUpRight,
  Code2,
  Layers,
  Compass,
  Zap,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { filterConversations, formatRelativeDate } from '../lib/helpers';

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

export const MainPage: React.FC<Props> = ({
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
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quickPrompt, setQuickPrompt] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const userDisplayName = useMemo(() => {
    return userEmail
      ? userEmail.split('@')[0].split('.')[0].replace(/^\w/, (c) => c.toUpperCase())
      : 'Guillaume';
  }, [userEmail]);

  const filteredConversations = useMemo(() => {
    return filterConversations(conversations, searchQuery);
  }, [conversations, searchQuery]);

  const handleStartQuickPrompt = (promptText: string) => {
    const text = promptText.trim();
    if (!text) return;
    const url = `/?c=new&q=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setQuickPrompt('');
  };

  const handleQuickPromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStartQuickPrompt(quickPrompt);
    }
  };

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

  return (
    <div className="min-h-full bg-[#06070b] bg-cosmic-grid text-zinc-100 flex flex-col relative overflow-x-hidden font-sans">
      {/* Ambient Background Spotlights */}
      <div className="pointer-events-none fixed top-[-180px] left-[25%] w-[600px] h-[420px] bg-violet-600/12 rounded-full blur-[130px]" />
      <div className="pointer-events-none fixed bottom-[-200px] right-[10%] w-[500px] h-[400px] bg-cyan-500/8 rounded-full blur-[130px]" />

      {/* Top Navigation Header */}
      <header className="border-b border-white/[0.06] bg-[#06070b]/75 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left: Mobile Brand / Status Breadcrumb */}
          <div className="flex items-center gap-3">
            {onToggleMobileSidebar && (
              <button
                type="button"
                onClick={onToggleMobileSidebar}
                className="md:hidden p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 cursor-pointer"
                title="Menu"
              >
                <Layers size={16} className="text-violet-400" />
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold text-zinc-400 hidden sm:inline">Workspace</span>
              <span className="text-zinc-700 hidden sm:inline">/</span>
              <span className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                <Layers size={14} className="text-violet-400 hidden sm:inline" />
                Cockpit Principal
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.07] text-zinc-300">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-500'}`}
                />
                {isConnected ? 'API Prête' : 'Hors ligne'}
              </span>
            </div>
          </div>

          {/* Right: Quick Actions Bar */}
          <div className="flex items-center gap-2">
            {/* Model Pill */}
            <div className="hidden sm:flex items-center gap-1.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs transition-colors">
              <Cpu size={13} className="text-violet-400 shrink-0" />
              <select
                value={selectedModel}
                onChange={(e) => onSelectModel(e.target.value)}
                className="bg-transparent text-zinc-200 font-medium outline-none cursor-pointer pr-1"
                title="Changer de modèle"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id} className="bg-[#0c0e16] text-zinc-200">
                    {model.name}
                  </option>
                ))}
                {models.length === 0 && (
                  <>
                    <option value="gemini-3.8-flash-high" className="bg-[#0c0e16] text-zinc-200">
                      Gemini 3.8 Flash (High)
                    </option>
                    <option value="gemini-3.8-flash-medium" className="bg-[#0c0e16] text-zinc-200">
                      Gemini 3.8 Flash (Medium)
                    </option>
                    <option value="gemini-3.8-flash-low" className="bg-[#0c0e16] text-zinc-200">
                      Gemini 3.8 Flash (Low)
                    </option>
                  </>
                )}
              </select>
            </div>

            {/* Terminal */}
            <button
              type="button"
              onClick={onOpenTerminal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.07] text-zinc-200 text-xs font-medium transition-all cursor-pointer"
              title="Ouvrir le terminal web"
            >
              <Terminal size={13} className="text-cyan-400" />
              <span className="hidden sm:inline">Terminal</span>
            </button>

            {/* API Key */}
            <button
              type="button"
              onClick={onOpenApiKeyModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.07] text-zinc-200 text-xs font-medium transition-all cursor-pointer"
              title="Clé API & Intégrations"
            >
              <Key size={13} className="text-violet-400" />
              <span className="hidden sm:inline">API</span>
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.07] text-zinc-300 hover:text-white transition-all cursor-pointer"
              title="Paramètres"
            >
              <SettingsIcon size={14} />
            </button>

            {/* User profile & Logout */}
            <div className="flex items-center gap-1 pl-1 sm:pl-2 border-l border-white/[0.08]">
              <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.08] rounded-xl px-2.5 py-1 text-xs">
                <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                  {userEmail ? userEmail.slice(0, 1).toUpperCase() : 'G'}
                </div>
                <span className="max-w-[100px] sm:max-w-[130px] truncate font-medium text-zinc-200 hidden xs:inline text-[11px]">
                  {userDisplayName}
                </span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                title="Se déconnecter"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-10 relative z-10">
        {/* Hero Command Center */}
        <section className="relative rounded-3xl glass-panel p-6 sm:p-10 overflow-hidden">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-violet-600/20 via-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs font-medium">
              <Sparkles size={12} className="text-violet-400" />
              <span>Agent Autonome • Multi-Onglets Isolés</span>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Bonjour,{' '}
                <span className="bg-gradient-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-transparent">
                  {userDisplayName}
                </span>
              </h1>
              <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                Lancez une instruction ci-dessous ou ouvrez une session dédiée. Chaque tâche s'exécute dans un environnement fluide et autonome.
              </p>
            </div>

            {/* Spotlight Command Input */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600/50 via-indigo-500/40 to-cyan-500/50 rounded-2xl blur opacity-30 group-focus-within:opacity-75 transition duration-300 pointer-events-none" />
              <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-[#090b11] border border-white/[0.1] group-focus-within:border-violet-500/60 rounded-2xl p-2.5 shadow-2xl transition-all">
                <textarea
                  value={quickPrompt}
                  onChange={(e) => setQuickPrompt(e.target.value)}
                  onKeyDown={handleQuickPromptKeyDown}
                  placeholder="Décrivez une tâche, posez une question ou lancez un audit de code..."
                  rows={2}
                  className="flex-1 bg-transparent px-3 py-1.5 text-sm text-white placeholder-zinc-500 resize-none outline-none"
                />

                <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                  <a
                    href="/?c=new"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      window.open('/?c=new', '_blank');
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Ouvrir une session vierge"
                  >
                    <Plus size={14} />
                    <span>Session vierge</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleStartQuickPrompt(quickPrompt)}
                    disabled={!quickPrompt.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-35 text-white text-xs font-semibold shadow-lg shadow-violet-600/25 transition-all cursor-pointer shrink-0"
                  >
                    <span>Exécuter</span>
                    <Send size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* Bento Starter Templates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {quickTemplates.map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleStartQuickPrompt(item.prompt)}
                    className="group text-left p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-violet-500/30 transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`p-2 rounded-xl border ${item.color}`}>
                        <IconComponent size={15} />
                      </div>
                      <ArrowUpRight
                        size={14}
                        className="text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                      />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-zinc-200 group-hover:text-white transition-colors">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5 leading-snug">
                        {item.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Conversations Directory Section */}
        <section className="space-y-5">
          {/* Toolbar: Title, Search, View Switcher, Clear */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <MessageSquare size={17} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">Sessions de travail</h2>
                <p className="text-xs text-zinc-500">
                  {filteredConversations.length} conversation{filteredConversations.length > 1 ? 's' : ''} enregistrée{filteredConversations.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search Box */}
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher une session..."
                  className="w-full bg-white/[0.03] border border-white/[0.07] focus:border-violet-500/50 text-zinc-200 text-xs rounded-xl pl-9 pr-3 py-2 placeholder-zinc-500 outline-none transition-all"
                />
              </div>

              {/* View Switcher (Grid / List) */}
              <div className="flex items-center bg-white/[0.03] p-1 rounded-xl border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Vue Grille"
                >
                  <LayoutGrid size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Vue Liste"
                >
                  <List size={13} />
                </button>
              </div>

              {/* Refresh */}
              <button
                type="button"
                onClick={onRefresh}
                className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.07] text-zinc-400 hover:text-white transition-all cursor-pointer"
                title="Actualiser"
              >
                <RefreshCw size={14} />
              </button>

              {/* Clear All */}
              {conversations.length > 0 && onClearAllConversations && (
                <button
                  type="button"
                  onClick={onClearAllConversations}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium transition-all cursor-pointer"
                  title="Tout supprimer"
                >
                  <Trash2 size={13} />
                  <span className="hidden sm:inline">Purger</span>
                </button>
              )}
            </div>
          </div>

          {/* Empty State */}
          {filteredConversations.length === 0 ? (
            <div className="p-14 rounded-3xl glass-panel text-center max-w-lg mx-auto my-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mx-auto mb-4">
                <MessageSquare size={22} />
              </div>
              <h3 className="text-sm font-bold text-white">
                {searchQuery ? 'Aucun résultat pour cette recherche' : 'Aucune session active'}
              </h3>
              <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                {searchQuery
                  ? 'Essayez avec d’autres termes ou effacez le filtre.'
                  : 'Démarrez votre première session avec Antigravity en utilisant la barre de commande ci-dessus.'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredConversations.map((conv) => (
                <a
                  key={conv.conversation_id}
                  href={`/?c=${conv.conversation_id}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(`/?c=${conv.conversation_id}`, '_blank');
                  }}
                  className="group flex flex-col justify-between p-5 rounded-2xl glass-panel hover:bg-white/[0.04] hover:border-violet-500/40 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer relative overflow-hidden"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                          <MessageSquare size={14} />
                        </div>
                        <h4 className="font-bold text-sm text-zinc-100 group-hover:text-white transition-colors truncate">
                          {conv.title || 'Session sans titre'}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {onDeleteConversation && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onDeleteConversation(conv.conversation_id);
                            }}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            title="Supprimer"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <div className="p-1.5 rounded-lg text-zinc-500 group-hover:text-violet-400 transition-colors">
                          <ExternalLink size={13} />
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4 min-h-[2.5rem]">
                      {conv.preview || 'Aucun aperçu disponible pour cette session.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-3 border-t border-white/[0.06] font-mono">
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className="text-zinc-600" />
                      <span>{formatRelativeDate(conv.last_modified_time)}</span>
                    </div>

                    {Boolean(conv.step_count) && (
                      <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-300 text-[10px]">
                        {conv.step_count} tour{conv.step_count > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            /* Compact List View */
            <div className="rounded-2xl glass-panel divide-y divide-white/[0.06] overflow-hidden">
              {filteredConversations.map((conv) => (
                <a
                  key={conv.conversation_id}
                  href={`/?c=${conv.conversation_id}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(`/?c=${conv.conversation_id}`, '_blank');
                  }}
                  className="group flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 shrink-0">
                      <MessageSquare size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs sm:text-sm text-zinc-100 group-hover:text-violet-300 truncate transition-colors">
                        {conv.title || 'Session sans titre'}
                      </div>
                      <div className="text-xs text-zinc-500 truncate mt-0.5">
                        {conv.preview || 'Aucun aperçu'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs font-mono text-zinc-500">
                    {Boolean(conv.step_count) && (
                      <span className="hidden sm:inline px-2 py-0.5 rounded bg-white/[0.04] text-[10px] text-zinc-400">
                        {conv.step_count} étapes
                      </span>
                    )}
                    <span className="text-[11px]">{formatRelativeDate(conv.last_modified_time)}</span>
                    {onDeleteConversation && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteConversation(conv.conversation_id);
                        }}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <ExternalLink size={13} className="text-zinc-600 group-hover:text-violet-400" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
