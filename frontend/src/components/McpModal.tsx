import React, { useState } from 'react';
import {
  Boxes,
  Globe,
  Compass,
  ShieldAlert,
  FolderGit2,
  DownloadCloud,
  GitBranch,
  Brain,
  Plus,
  Trash2,
  Power,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Terminal,
  Check,
  AlertCircle,
  Server,
  Layers,
} from 'lucide-react';
import type { McpServer, McpPreset } from '../lib/types';

interface McpModalProps {
  isOpen: boolean;
  onClose: () => void;
  servers: McpServer[];
  presets: McpPreset[];
  loading: boolean;
  actionLoading: string | null;
  error: string | null;
  onRefresh: () => void;
  onAddOrUpdate: (server: McpServer) => Promise<boolean>;
  onRemove: (name: string) => Promise<boolean>;
  onToggle: (name: string, disabled?: boolean) => Promise<boolean>;
  onInstallPreset: (preset: McpPreset) => Promise<boolean>;
}

export const McpModal: React.FC<McpModalProps> = ({
  isOpen,
  onClose,
  servers,
  presets,
  loading,
  actionLoading,
  error,
  onRefresh,
  onAddOrUpdate,
  onRemove,
  onToggle,
  onInstallPreset,
}) => {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<'stdio' | 'http'>('stdio');
  const [customCommand, setCustomCommand] = useState('npx');
  const [customArgs, setCustomArgs] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customEnv, setCustomEnv] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeCount = servers.filter((s) => !s.disabled).length;

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'Globe':
        return <Globe className="w-5 h-5 text-cyan-400" />;
      case 'Compass':
        return <Compass className="w-5 h-5 text-indigo-400" />;
      case 'ShieldAlert':
        return <ShieldAlert className="w-5 h-5 text-amber-400" />;
      case 'FolderGit2':
        return <FolderGit2 className="w-5 h-5 text-emerald-400" />;
      case 'DownloadCloud':
        return <DownloadCloud className="w-5 h-5 text-sky-400" />;
      case 'GitBranch':
        return <GitBranch className="w-5 h-5 text-violet-400" />;
      case 'Brain':
        return <Brain className="w-5 h-5 text-fuchsia-400" />;
      default:
        return <Server className="w-5 h-5 text-zinc-400" />;
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const name = customName.trim();
    if (!name) {
      setFormError('Le nom du serveur est obligatoire.');
      return;
    }

    let parsedEnv: Record<string, string> = {};
    if (customEnv.trim()) {
      try {
        const lines = customEnv.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim();
            parsedEnv[k] = v;
          }
        }
      } catch {
        setFormError('Format des variables d’environnement invalide (utilisez KEY=VAL par ligne).');
        return;
      }
    }

    const parsedArgs = customArgs
      .trim()
      .split(/\s+/)
      .filter((a) => a.length > 0);

    const newServer: McpServer = {
      name,
      server_type: customType,
      command: customType === 'stdio' ? customCommand.trim() : undefined,
      args: customType === 'stdio' ? parsedArgs : undefined,
      serverUrl: customType === 'http' ? customUrl.trim() : undefined,
      env: Object.keys(parsedEnv).length > 0 ? parsedEnv : undefined,
      disabled: false,
    };

    const success = await onAddOrUpdate(newServer);
    if (success) {
      setCustomName('');
      setCustomArgs('');
      setCustomUrl('');
      setCustomEnv('');
      setShowCustomForm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0c0d14] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-[#0e101a]/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 shadow-inner">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-100">Serveurs MCP (Model Context Protocol)</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {activeCount} actif{activeCount > 1 ? 's' : ''} / {servers.length}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Connectez des outils réels (navigateur web Chromium, Camoufox, système de fichiers, APIs) directement à l'agent IA.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Rafraîchir les serveurs"
              className="p-2 text-zinc-400 hover:text-zinc-200 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-200 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

          {/* Section: Presets (Préréglages 1-Clic) */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Préréglages 1-Clic (Navigateur, Outils & Intégrations)</h3>
              </div>
              <span className="text-xs text-zinc-500">Installation instantanée dans le conteneur</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {presets.map((preset) => {
                const existing = servers.find((s) => s.name === preset.name);
                const isInstalled = !!existing;
                const isActionPending = actionLoading === preset.name;

                return (
                  <div
                    key={preset.id}
                    className={`relative p-4 rounded-xl border transition-all flex flex-col justify-between ${
                      isInstalled
                        ? existing.disabled
                          ? 'bg-[#10121d]/60 border-zinc-700/50 opacity-80'
                          : 'bg-violet-950/20 border-violet-500/30'
                        : 'bg-[#10121d]/80 border-white/5 hover:border-violet-500/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                            {getPresetIcon(preset.icon)}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-100">{preset.title}</h4>
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/5">
                              {preset.server_type}
                            </span>
                          </div>
                        </div>

                        {isInstalled ? (
                          <span
                            className={`text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1 font-medium border ${
                              existing.disabled
                                ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            {existing.disabled ? 'Inactif' : 'Installé'}
                          </span>
                        ) : (
                          <button
                            onClick={() => onInstallPreset(preset)}
                            disabled={isActionPending}
                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-all shadow-lg shadow-violet-600/20 flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {isActionPending ? 'Installation...' : 'Installer'}
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                        {preset.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                      <span className="truncate max-w-[280px]">
                        {preset.server_type === 'stdio'
                          ? `${preset.command} ${preset.args?.join(' ') || ''}`
                          : preset.serverUrl}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section: Configured MCP Servers */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Serveurs MCP Actuellement Configurés</h3>
              </div>
              <span className="text-xs text-zinc-500">
                Fichier cible : <code className="text-zinc-400 font-mono">~/.gemini/config/mcp_config.json</code>
              </span>
            </div>

            {servers.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-white/10 bg-[#0d0f17]/50 text-center flex flex-col items-center justify-center">
                <Boxes className="w-10 h-10 text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-300 font-medium">Aucun serveur MCP configuré</p>
                <p className="text-xs text-zinc-500 max-w-sm mt-1 mb-4">
                  Choisissez un préréglage ci-dessus (comme le Navigateur Puppeteer ou Camoufox) pour donner des capacités d'action immédiates à votre agent.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {servers.map((server) => {
                  const isActionPending = actionLoading === server.name;
                  return (
                    <div
                      key={server.name}
                      className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        server.disabled
                          ? 'bg-[#0f111a]/40 border-white/5 opacity-70'
                          : 'bg-[#101322]/80 border-white/10 shadow-lg'
                      }`}
                    >
                      <div className="flex items-start md:items-center gap-3">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 md:mt-0 ${
                            server.disabled
                              ? 'bg-zinc-600'
                              : 'bg-emerald-400 ring-4 ring-emerald-400/20'
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-100">{server.name}</span>
                            <span
                              className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${
                                server.server_type === 'http'
                                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              }`}
                            >
                              {server.server_type}
                            </span>
                            {server.disabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                Désactivé
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
                            {server.server_type === 'stdio' ? (
                              <>
                                <span className="text-zinc-200">{server.command}</span>
                                {server.args && server.args.length > 0 && (
                                  <span className="text-zinc-400">{server.args.join(' ')}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-zinc-200">{server.serverUrl}</span>
                            )}

                            {server.env && Object.keys(server.env).length > 0 && (
                              <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">
                                {Object.keys(server.env).length} var(s) d'env
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <button
                          onClick={() => onToggle(server.name, !server.disabled)}
                          disabled={isActionPending}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                            server.disabled
                              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                          } disabled:opacity-50`}
                          title={server.disabled ? 'Activer ce serveur' : 'Désactiver temporairement ce serveur'}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {server.disabled ? 'Activer' : 'Désactiver'}
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm(`Supprimer définitivement le serveur MCP "${server.name}" ?`)) {
                              onRemove(server.name);
                            }
                          }}
                          disabled={isActionPending}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all disabled:opacity-50"
                          title="Supprimer ce serveur MCP"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section: Custom MCP Form */}
          <section className="border-t border-white/10 pt-6">
            <button
              onClick={() => setShowCustomForm(!showCustomForm)}
              className="flex items-center justify-between w-full p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-200">Ajouter un serveur MCP personnalisé</h4>
                  <p className="text-xs text-zinc-500">Pour connecter n'importe quel binaire, script ou endpoint SSE</p>
                </div>
              </div>
              {showCustomForm ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {showCustomForm && (
              <form onSubmit={handleCustomSubmit} className="mt-4 p-5 rounded-xl border border-white/10 bg-[#0e101a] space-y-4">
                {formError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Nom unique de l'outil / serveur <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ex: mon-navigateur-perso"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Type de transport
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCustomType('stdio')}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          customType === 'stdio'
                            ? 'bg-violet-600/20 border-violet-500 text-violet-200'
                            : 'bg-black/30 border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Stdio (Ligne de commande)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomType('http')}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          customType === 'http'
                            ? 'bg-violet-600/20 border-violet-500 text-violet-200'
                            : 'bg-black/30 border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        HTTP / SSE (URL distante)
                      </button>
                    </div>
                  </div>
                </div>

                {customType === 'stdio' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Commande (exécutable) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="npx, python3, docker..."
                        value={customCommand}
                        onChange={(e) => setCustomCommand(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500 font-mono"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Arguments (séparés par un espace)
                      </label>
                      <input
                        type="text"
                        placeholder="-y @modelcontextprotocol/server-..."
                        value={customArgs}
                        onChange={(e) => setCustomArgs(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500 font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      URL du serveur SSE <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="url"
                      placeholder="http://172.17.0.1:8000/sse"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500 font-mono"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Variables d'environnement (optionnel, une par ligne: KEY=VAL)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium&#10;API_TOKEN=xxx"
                    value={customEnv}
                    onChange={(e) => setCustomEnv(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-violet-500 font-mono"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomForm(false)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading !== null}
                    className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-all shadow-lg shadow-violet-600/20 disabled:opacity-50"
                  >
                    Enregistrer et Activer
                  </button>
                </div>
              </form>
            )}
          </section>

        </div>

        {/* Footer info */}
        <div className="px-6 py-4 bg-[#090a10] border-t border-white/10 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <span>Les outils MCP sont automatiquement injectés dans les prompts d'Antigravity.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-zinc-200 rounded-lg font-medium transition-colors"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
