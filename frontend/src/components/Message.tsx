import React, { useState, useMemo } from 'react';
import type { Message as MessageType } from '../lib/types';
import { marked } from 'marked';
import {
  Sparkles,
  User,
  ChevronDown,
  ChevronRight,
  Terminal,
  Check,
  Copy,
  BrainCircuit,
  Clock,
  Zap,
} from 'lucide-react';

interface Props {
  message: MessageType;
}

export const Message: React.FC<Props> = ({ message }) => {
  const [showThought, setShowThought] = useState(false);
  const [copied, setCopied] = useState(false);

  const renderedHtml = useMemo(() => {
    return message.content ? (marked.parse(message.content, { async: false }) as string) : '';
  }, [message.content]);

  const copyContent = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (message.role === 'user') {
    return (
      <div className="py-4 px-3 sm:px-6 w-full max-w-4xl mx-auto font-sans">
        <div className="flex items-start justify-end gap-3.5">
          <div className="flex flex-col items-end max-w-[85%] sm:max-w-[75%]">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-1.5 px-1">
              <span className="font-semibold text-zinc-300">Vous</span>
            </div>
            <div className="rounded-2xl rounded-tr-xs px-4 py-3 bg-gradient-to-br from-violet-600/90 to-indigo-600/90 text-white text-sm leading-relaxed shadow-lg shadow-violet-950/30 border border-white/15">
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>

          <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center shrink-0 text-zinc-200 mt-5">
            <User size={15} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 px-3 sm:px-6 w-full max-w-4xl mx-auto font-sans">
      <div className="flex items-start gap-3.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center shrink-0 shadow-lg shadow-violet-600/20 text-white mt-0.5 border border-white/20">
          <Sparkles size={15} />
        </div>

        <div className="flex flex-col gap-2.5 flex-1 min-w-0">
          {/* Header & Telemetry */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-white tracking-tight">Antigravity</span>
            {message.usage?.duration_seconds !== undefined && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/[0.05]">
                <Clock size={10} />
                {message.usage.duration_seconds.toFixed(1)}s
              </span>
            )}
            {message.usage?.total_tokens !== undefined && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/[0.05]">
                <Zap size={10} className="text-amber-400" />
                {message.usage.total_tokens} tok
              </span>
            )}
          </div>

          {/* Collapsible Thought / Reasoning Block */}
          {message.thought && (
            <div className="rounded-xl bg-[#090b11] border border-violet-500/20 overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setShowThought(!showThought)}
                className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs font-medium text-violet-300/90 hover:text-violet-200 hover:bg-violet-500/5 transition-colors w-full text-left cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <BrainCircuit
                    size={14}
                    className={`text-violet-400 ${
                      message.isStreaming && !message.content ? 'animate-pulse' : ''
                    }`}
                  />
                  <span>Chaîne de réflexion</span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    ({message.thought.length} car.)
                  </span>
                </span>
                {showThought ? (
                  <ChevronDown size={14} className="text-zinc-500" />
                ) : (
                  <ChevronRight size={14} className="text-zinc-500" />
                )}
              </button>
              {showThought && (
                <div className="px-3.5 py-3 text-zinc-400 whitespace-pre-wrap font-mono text-[11px] leading-relaxed max-h-72 overflow-y-auto border-t border-white/[0.06] bg-black/40">
                  {message.thought}
                </div>
              )}
            </div>
          )}

          {/* Executed Tools Badges */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {message.toolCalls.map((tool, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-[11px] font-mono shadow-xs"
                >
                  <Terminal size={11} className="text-cyan-400" />
                  <span>{tool.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Assistant Content Card */}
          <div className="relative group rounded-2xl rounded-tl-xs p-4 sm:p-5 glass-panel text-sm leading-relaxed">
            {message.content ? (
              <div
                className="prose-dark max-w-none"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : message.isStreaming ? (
              <div className="flex items-center gap-2.5 text-zinc-400 text-xs py-1">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500"></span>
                </span>
                <span className="font-medium text-zinc-300">Élaboration de la réponse...</span>
              </div>
            ) : null}

            {message.isStreaming && message.content && (
              <span className="inline-block w-2 h-4 ml-1 bg-violet-400 animate-pulse align-middle rounded-xs" />
            )}

            {/* Floating Copy Button */}
            {message.content && !message.isStreaming && (
              <button
                type="button"
                onClick={copyContent}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all px-2.5 py-1.5 rounded-lg bg-[#0c0e16]/90 hover:bg-violet-600 border border-white/10 text-zinc-300 hover:text-white text-xs flex items-center gap-1.5 cursor-pointer shadow-lg"
                title="Copier la réponse"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-emerald-400" />
                    <span className="text-[11px] font-medium text-emerald-300">Copié</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span className="text-[11px] font-medium">Copier</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
