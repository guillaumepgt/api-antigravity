import React, { useState, useMemo } from 'react';
import type { Conversation, Model } from '../lib/types';
import {
  Sparkles,
  Plus,
  RefreshCw,
  Search,
  MessageSquare,
  Trash2,
  Terminal,
  Settings as SettingsIcon,
  Key,
  Cpu,
  LogOut,
  Boxes,
} from 'lucide-react';
import { filterConversations, formatRelativeDate } from '../lib/helpers';

interface Props {
  conversations: Conversation[];
  currentConversationId?: string | null;
  models: Model[];
  selectedModel: string;
  isConnected: boolean;
  isAuthenticated: boolean;
  userEmail: string;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  onSelectModel: (modelId: string) => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onOpenApiKeyModal?: () => void;
  onOpenMcpModal?: () => void;
  onDeleteConversation?: (id: string) => void;
  onClearAllConversations?: () => void;
  onLogout: () => void;
  onRefresh: () => void;
}

export const Sidebar: React.FC<Props> = ({
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
  onOpenMcpModal,
  onDeleteConversation,
  onClearAllConversations,
  onLogout,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    return filterConversations(conversations, searchQuery);
  }, [conversations, searchQuery]);

  return (
    <aside className="w-76 bg-[#080a10]/95 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col h-full shrink-0 select-none relative z-20 font-sans">
      {/* Subtle Top Ambient Glow */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-violet-600/8 to-transparent pointer-events-none" />

      {/* Brand Header */}
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-xl blur opacity-50 group-hover:opacity-80 transition duration-300" />
            <div className="relative w-9 h-9 rounded-xl bg-[#0c0e16] border border-white/15 flex items-center justify-center font-extrabold text-white text-sm tracking-tighter shadow-md">
              <Sparkles size={16} className="text-violet-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-white tracking-tight leading-none">Antigravity</h1>
              <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25">
                OS
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="relative flex h-2 w-2">
                {isConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isConnected ? 'bg-emerald-400' : 'bg-rose-500'
                  }`}
                />
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">
                {isConnected ? 'Node Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] text-zinc-400 hover:text-white transition-all cursor-pointer"
          title="Rafraîchir"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Primary Action: New Chat Button (Opens in new browser tab) */}
      <div className="px-3.5 pt-3.5 pb-2">
        <a
          href="/?c=new"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            e.preventDefault();
            window.open('/?c=new', '_blank');
          }}
          className="group relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 bg-[length:200%_auto] hover:bg-right text-white text-xs font-semibold shadow-lg shadow-violet-600/20 border border-white/15 transition-all duration-300 cursor-pointer"
          title="Ouvrir une nouvelle discussion dans un nouvel onglet"
        >
          <span className="flex items-center gap-2">
            <Plus size={15} className="transition-transform group-hover:rotate-90" />
            <span>Nouvelle Session</span>
          </span>
          <span className="flex items-center gap-1 text-[10px] font-mono bg-black/25 px-1.5 py-0.5 rounded-md text-violet-100">
            <span>Agent</span>
            <Sparkles size={10} />
          </span>
        </a>
      </div>

      {/* Model Selector */}
      <div className="px-3.5 py-2">
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
          <label
            htmlFor="sidebar-model-select"
            className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5"
          >
            <Cpu size={11} className="text-violet-400" />
            <span>Moteur actif</span>
          </label>
          <select
            id="sidebar-model-select"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
            className="w-full bg-[#0c0f17] border border-white/[0.08] hover:border-violet-500/40 text-zinc-200 text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-500 transition-colors cursor-pointer"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id} className="bg-[#0c0f17] text-zinc-200">
                {model.name}
              </option>
            ))}
            {models.length === 0 && (
              <>
                <option value="gemini-3.8-flash-high" className="bg-[#0c0f17] text-zinc-200">
                  Gemini 3.8 Flash (High)
                </option>
                <option value="gemini-3.8-flash-medium" className="bg-[#0c0f17] text-zinc-200">
                  Gemini 3.8 Flash (Medium)
                </option>
                <option value="gemini-3.8-flash-low" className="bg-[#0c0f17] text-zinc-200">
                  Gemini 3.8 Flash (Low)
                </option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Search Input */}
      <div className="px-3.5 py-1.5">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer l'historique..."
            className="w-full bg-white/[0.03] border border-white/[0.06] focus:border-violet-500/50 text-zinc-200 text-xs rounded-xl pl-8 pr-3 py-1.5 placeholder-zinc-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* Conversation History List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1">
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
            Historique ({filteredConversations.length})
          </span>
          {conversations.length > 0 && onClearAllConversations && (
            <button
              type="button"
              onClick={onClearAllConversations}
              className="text-[10px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1"
              title="Purger l'historique"
            >
              <Trash2 size={11} />
              <span>Purger</span>
            </button>
          )}
        </div>

        {filteredConversations.map((conv) => (
          <div
            key={conv.conversation_id}
            className={`group relative flex items-center justify-between w-full rounded-xl transition-all duration-150 ${
              currentConversationId === conv.conversation_id
                ? 'bg-violet-500/15 border border-violet-500/30 text-white shadow-xs'
                : 'hover:bg-white/[0.04] text-zinc-300 border border-transparent hover:border-white/[0.05]'
            }`}
          >
            <a
              href={`/?c=${conv.conversation_id}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                window.open(`/?c=${conv.conversation_id}`, '_blank');
              }}
              className="flex-1 min-w-0 p-2.5 flex items-start gap-2.5 text-xs text-left cursor-pointer"
              title={`Ouvrir "${conv.title || conv.preview || 'Session'}" dans un nouvel onglet`}
            >
              <div className="p-1.5 rounded-lg bg-white/[0.04] group-hover:bg-violet-500/15 transition-colors mt-0.5">
                <MessageSquare
                  size={12}
                  className={`shrink-0 ${
                    currentConversationId === conv.conversation_id
                      ? 'text-violet-400'
                      : 'text-zinc-500 group-hover:text-violet-300'
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate leading-snug group-hover:text-white transition-colors">
                  {conv.title || conv.preview || 'Session sans titre'}
                </div>
                <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-1 font-mono">
                  <span>{conv.step_count || 1} étapes</span>
                  <span>•</span>
                  <span>{formatRelativeDate(conv.last_modified_time)}</span>
                </div>
              </div>
            </a>

            {onDeleteConversation && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteConversation(conv.conversation_id);
                }}
                className="p-1.5 mr-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                title="Supprimer cette discussion"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}

        {filteredConversations.length === 0 && (
          <div className="text-center py-10 px-4">
            <div className="w-8 h-8 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-2 text-zinc-600">
              <MessageSquare size={14} />
            </div>
            <p className="text-xs text-zinc-500">Aucune conversation trouvée</p>
          </div>
        )}
      </div>

      {/* Bottom Control Dock & User Profile */}
      <div className="p-3 border-t border-white/[0.06] bg-[#06070b]/60 space-y-2">
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={onOpenTerminal}
            className="flex flex-col items-center justify-center gap-1 py-2 px-0.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-zinc-300 hover:text-white text-[10px] font-medium transition-all cursor-pointer"
            title="Terminal Web"
          >
            <Terminal size={13} className="text-cyan-400" />
            <span className="truncate">Terminal</span>
          </button>

          {onOpenApiKeyModal && (
            <button
              type="button"
              onClick={onOpenApiKeyModal}
              className="flex flex-col items-center justify-center gap-1 py-2 px-0.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-zinc-300 hover:text-white text-[10px] font-medium transition-all cursor-pointer"
              title="Clé API & SDK"
            >
              <Key size={13} className="text-violet-400" />
              <span className="truncate">Clé API</span>
            </button>
          )}

          {onOpenMcpModal && (
            <button
              type="button"
              onClick={onOpenMcpModal}
              className="flex flex-col items-center justify-center gap-1 py-2 px-0.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-zinc-300 hover:text-white text-[10px] font-medium transition-all cursor-pointer"
              title="Serveurs MCP (Navigateur, Outils)"
            >
              <Boxes size={13} className="text-fuchsia-400" />
              <span className="truncate">MCP</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex flex-col items-center justify-center gap-1 py-2 px-0.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-zinc-300 hover:text-white text-[10px] font-medium transition-all cursor-pointer"
            title="Paramètres & Accès distant"
          >
            <SettingsIcon size={13} className="text-amber-400" />
            <span className="truncate">Réglages</span>
          </button>
        </div>

        {/* User Card */}
        <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              {userEmail ? userEmail.slice(0, 1).toUpperCase() : 'G'}
            </div>
            <div className="truncate text-left min-w-0">
              <div className="font-semibold text-zinc-200 text-xs truncate">
                {userEmail || 'Guillaume'}
              </div>
              <div className="text-[10px] text-emerald-400/90 flex items-center gap-1 font-medium">
                <span>Session isolée</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="Se déconnecter"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};
