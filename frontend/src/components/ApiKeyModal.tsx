import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  RefreshCw,
  Key,
  Code,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { generateSnippet } from '../lib/helpers';
import { regenerateUserKey } from '../lib/api';

interface KeyInfo {
  api_key: string;
  created_at?: string;
  curl_example?: string;
  python_example?: string;
  js_example?: string;
}

interface Props {
  isOpen: boolean;
  keyInfo: KeyInfo | null;
  onClose: () => void;
  onKeyUpdated?: (newKey: string) => void;
}

export const ApiKeyModal: React.FC<Props> = ({
  isOpen,
  keyInfo,
  onClose,
  onKeyUpdated,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'curl' | 'python' | 'ts'>('curl');

  if (!isOpen) return null;

  const apiKey = keyInfo?.api_key || 'agy_sk_loading...';

  const copyToClipboard = async (text: string, type: 'key' | 'snippet') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedSnippet(true);
        setTimeout(() => setCopiedSnippet(false), 2000);
      }
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        'Voulez-vous vraiment générer une nouvelle clé API ? Vos scripts utilisant l’ancienne clé ne fonctionneront plus.'
      )
    ) {
      return;
    }
    setIsRegenerating(true);
    try {
      const res = await regenerateUserKey(apiKey);
      if (res.api_key && onKeyUpdated) {
        onKeyUpdated(res.api_key);
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la régénération de la clé');
    } finally {
      setIsRegenerating(false);
    }
  };

  const snippet = generateSnippet(selectedTab, apiKey);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-sans">
      <div className="bg-[#0b0d14] border border-white/[0.08] rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/20">
              <Key size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Clé API & Intégrations</h2>
              <p className="text-[11px] text-zinc-500">
                Utilisez Antigravity depuis votre terminal, Cursor ou Python
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto text-xs">
          {/* Key Field Card */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" />
                Votre clé personnelle active
              </span>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="text-[11px] text-zinc-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={11} className={isRegenerating ? 'animate-spin' : ''} />
                <span>Régénérer</span>
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#06070b] border border-white/[0.08] rounded-xl px-3 py-2">
              <input
                type={showKey ? 'text' : 'password'}
                readOnly
                value={apiKey}
                className="bg-transparent border-none outline-none text-zinc-200 font-mono text-xs flex-1 select-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer"
                title={showKey ? 'Masquer' : 'Afficher'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(apiKey, 'key')}
                className="px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
              >
                {copiedKey ? (
                  <>
                    <Check size={12} className="text-emerald-400" />
                    <span>Copié</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copier</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">
              Compatible avec le protocole OpenAI. Vous pouvez l'utiliser directement dans Cursor, Claude Code, ou Continue.
            </p>
          </div>

          {/* Code Snippets Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                <Code size={13} className="text-cyan-400" />
                Exemple d'intégration
              </span>
              <div className="flex rounded-lg bg-white/[0.03] p-0.5 border border-white/[0.06]">
                {(['curl', 'python', 'ts'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSelectedTab(tab)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      selectedTab === tab
                        ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative rounded-2xl bg-[#06070b] border border-white/[0.08] overflow-hidden group">
              <pre className="p-4 text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed select-all">
                {snippet}
              </pre>
              <button
                type="button"
                onClick={() => copyToClipboard(snippet, 'snippet')}
                className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer"
              >
                {copiedSnippet ? (
                  <>
                    <Check size={11} className="text-emerald-400" />
                    <span>Copié</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} />
                    <span>Copier le code</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
