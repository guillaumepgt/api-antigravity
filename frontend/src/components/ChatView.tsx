import React, { useRef, useEffect } from 'react';
import type { Model, AppSettings } from '../lib/types';
import { Message } from './Message';
import { InputBar } from './InputBar';
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
} from 'lucide-react';

interface Props {
  currentConversationId: string | null;
  messages: any[];
  isStreaming: boolean;
  isLoadingTranscript: boolean;
  activeTitle: string;
  settings: AppSettings;
  models: Model[];
  isConnected: boolean;
  onSelectModel: (id: string) => void;
  onSendMessage: (text: string, onScroll?: () => void) => void;
  onStopGeneration: () => void;
  onDeleteConversation: (id: string) => void;
  onReturnToMainTab: () => void;
  onOpenTerminal: () => void;
}

export const ChatView: React.FC<Props> = ({
  currentConversationId,
  messages,
  isStreaming,
  isLoadingTranscript,
  activeTitle,
  settings,
  models,
  isConnected,
  onSelectModel,
  onSendMessage,
  onStopGeneration,
  onDeleteConversation,
  onReturnToMainTab,
  onOpenTerminal,
}) => {
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 50);
  };

  useEffect(() => {
    if (messages.length > 0 && !isLoadingTranscript) {
      scrollToBottom();
    }
  }, [messages.length, isLoadingTranscript]);

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-[#06070b] bg-cosmic-grid relative overflow-hidden select-text font-sans">
      <div className="pointer-events-none fixed top-[-220px] left-1/2 -translate-x-1/2 w-[650px] h-[340px] bg-violet-600/10 rounded-full blur-[140px]" />

      {/* Floating Glass Header */}
      <header className="sticky top-0 z-20 px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#06070b]/80 backdrop-blur-xl select-none">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onReturnToMainTab}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer shrink-0"
            title="Retourner au Cockpit"
          >
            <ArrowLeft size={13} />
            <span>Cockpit</span>
          </button>

          <div className="h-4 w-[1px] bg-white/[0.08] hidden sm:block" />

          <div className="truncate text-xs font-semibold text-zinc-200 hidden sm:block max-w-md">
            {activeTitle}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentConversationId && (
            <button
              type="button"
              onClick={() => onDeleteConversation(currentConversationId)}
              className="p-2 rounded-xl bg-white/[0.03] hover:bg-rose-500/15 border border-white/[0.07] hover:border-rose-500/30 text-zinc-400 hover:text-rose-300 text-xs transition-all cursor-pointer"
              title="Supprimer cette session"
            >
              <Trash2 size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenTerminal}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] text-cyan-400 text-xs transition-all cursor-pointer"
            title="Ouvrir le terminal"
          >
            <Terminal size={13} />
          </button>

          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-xs transition-colors">
            <Cpu size={12} className="text-violet-400 shrink-0" />
            <select
              value={settings.selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              className="bg-transparent text-xs font-semibold text-zinc-200 outline-none cursor-pointer pr-1"
              title="Changer de modèle ou niveau de réflexion"
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

          <a
            href="/?c=new"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              e.preventDefault();
              window.open('/?c=new', '_blank');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 text-xs font-semibold transition-all cursor-pointer"
            title="Ouvrir un nouveau chat dans un autre onglet"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">Nouvelle Session</span>
          </a>
        </div>
      </header>

      {/* Message Scroll Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-2 sm:px-4 pt-4 pb-6 scroll-smooth relative z-10"
      >
        {isLoadingTranscript ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400 select-none">
            <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin mb-3" />
            <span className="text-xs font-medium text-zinc-300">Chargement de la discussion...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 max-w-xl mx-auto select-none my-auto py-12">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-violet-600/25 mb-4 border border-white/20">
              <Sparkles size={26} />
            </div>
            <h3 className="text-xl font-extrabold text-white tracking-tight">
              Session Autonome Prête
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 mt-2 max-w-md leading-relaxed">
              Posez une question, lancez un script shell ou ordonnez une modification de code. L'agent Antigravity exécutera vos outils en toute fluidité.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-8 w-full text-left">
              <button
                type="button"
                onClick={() => onSendMessage("Explique-moi l’architecture du projet et les technologies utilisées.", scrollToBottom)}
                className="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-violet-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
              >
                <Compass size={15} className="text-violet-400 shrink-0" />
                <span>Expliquer l'architecture du projet</span>
              </button>

              <button
                type="button"
                onClick={() => onSendMessage("Quels outils et MCP sont configurés sur ce nœud ?", scrollToBottom)}
                className="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-cyan-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
              >
                <Zap size={15} className="text-cyan-400 shrink-0" />
                <span>Lister les outils & MCP disponibles</span>
              </button>

              <button
                type="button"
                onClick={() => onSendMessage("Effectue un audit de sécurité et de propreté du code.", scrollToBottom)}
                className="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-emerald-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
              >
                <Code2 size={15} className="text-emerald-400 shrink-0" />
                <span>Auditer la qualité du code</span>
              </button>

              <button
                type="button"
                onClick={onOpenTerminal}
                className="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-amber-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
              >
                <Terminal size={15} className="text-amber-400 shrink-0" />
                <span>Ouvrir la console shell bash</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => (
              <Message key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>

      {/* Input Bar (pinned at bottom) */}
      <InputBar
        isStreaming={isStreaming}
        disabled={!isConnected}
        dangerMode={settings.dangerouslySkipPermissions}
        models={models}
        selectedModel={settings.selectedModel}
        onSelectModel={onSelectModel}
        onSend={(text) => onSendMessage(text, scrollToBottom)}
        onStop={onStopGeneration}
      />
    </div>
  );
};
