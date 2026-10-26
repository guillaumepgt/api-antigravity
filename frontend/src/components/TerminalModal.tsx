import React from 'react';
import { Terminal, Maximize2, Minimize2, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  isMaximized: boolean;
  terminalUrl: string;
  activeLoginId: string | null;
  onClose: () => void;
  onToggleMaximize: () => void;
  onValidateLogin?: () => void;
}

export const TerminalModal: React.FC<Props> = ({
  isOpen,
  isMaximized,
  terminalUrl,
  activeLoginId,
  onClose,
  onToggleMaximize,
  onValidateLogin,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 font-mono">
      <div
        className={`bg-[#050609] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 ${
          isMaximized ? 'w-full h-full' : 'w-full max-w-4xl h-[85vh]'
        }`}
      >
        {/* Terminal Header */}
        <div className="bg-[#0b0e17] px-4 py-3 border-b border-white/[0.08] flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              <button
                type="button"
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-500 inline-block cursor-pointer"
                title="Fermer"
              />
              <button
                type="button"
                onClick={onToggleMaximize}
                className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 inline-block cursor-pointer"
                title="Agrandir"
              />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <Terminal size={14} className="text-cyan-400" />
              <span className="font-semibold text-zinc-200">
                {activeLoginId ? 'oauth — Connexion Google Antigravity' : 'bash — antigravity-worker-01'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeLoginId && onValidateLogin && (
              <button
                type="button"
                onClick={onValidateLogin}
                className="px-3 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                Valider ma connexion
              </button>
            )}
            <button
              type="button"
              onClick={onToggleMaximize}
              className="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <iframe
          src={terminalUrl}
          className="flex-1 w-full h-full border-none bg-black"
          title="Terminal d'authentification Antigravity"
        />
      </div>
    </div>
  );
};
