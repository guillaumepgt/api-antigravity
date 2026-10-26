import React, { useState, useRef, useEffect } from 'react';
import type { Model } from '../lib/types';
import { Send, Square, ShieldAlert, Sparkles } from 'lucide-react';

interface Props {
  isStreaming: boolean;
  disabled?: boolean;
  dangerMode?: boolean;
  models?: Model[];
  selectedModel?: string;
  modelName?: string;
  onSelectModel?: (modelId: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}

export const InputBar: React.FC<Props> = ({
  isStreaming,
  disabled = false,
  dangerMode = true,
  models = [],
  selectedModel = '',
  onSelectModel,
  onSend,
  onStop,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = () => {
    const text = inputPrompt.trim();
    if (!text || isStreaming || disabled) return;
    onSend(text);
    setInputPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 pb-4 pt-1 relative z-20 font-sans">
      <div className="relative group">
        {/* Ambient Focus Halo */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600/40 via-indigo-500/30 to-cyan-500/40 rounded-3xl blur opacity-0 group-focus-within:opacity-100 transition duration-300 pointer-events-none"></div>

        <div className="relative glass-panel rounded-2xl shadow-2xl transition-all focus-within:border-violet-500/50 overflow-hidden">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputPrompt}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Envoyer une instruction à Antigravity... (Entrée pour envoyer, Maj+Entrée pour une ligne)"
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-white placeholder-zinc-500 resize-none outline-none max-h-48 min-h-[46px]"
          />

          {/* Bottom Control Bar */}
          <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              {onSelectModel && models.length > 0 ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-xs transition-colors">
                  <Sparkles size={12} className="text-violet-400 shrink-0" />
                  <select
                    value={selectedModel}
                    onChange={(e) => onSelectModel(e.target.value)}
                    disabled={isStreaming || disabled}
                    className="bg-transparent text-xs font-semibold text-zinc-200 outline-none cursor-pointer pr-1"
                    title="Changer le modèle d'IA"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#0c0e16] text-zinc-200">
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-mono text-violet-300 text-xs px-2.5 py-1 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <Sparkles size={12} />
                  Gemini 3.8 Flash
                </span>
              )}

              {dangerMode && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300/90 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20"
                  title="Exécution automatique des outils activée (--dangerously-skip-permissions)"
                >
                  <ShieldAlert size={11} className="text-amber-400" />
                  <span className="hidden sm:inline">Auto-Exec</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-zinc-500 hidden md:inline font-mono">
                ⏎ Envoyer
              </span>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-rose-600/25 cursor-pointer"
                >
                  <Square size={12} />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!inputPrompt.trim() || disabled}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-violet-600/25 cursor-pointer"
                >
                  <span>Envoyer</span>
                  <Send size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
