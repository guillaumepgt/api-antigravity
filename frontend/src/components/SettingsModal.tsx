import React, { useState, useEffect } from 'react';
import type { AppSettings, Model } from '../lib/types';
import { X, Key, Shield, SlidersHorizontal, Globe, Save, Cpu, Zap } from 'lucide-react';

interface Props {
  settings: AppSettings;
  models: Model[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<Props> = ({
  settings,
  models,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formApiKey, setFormApiKey] = useState('');
  const [formSelectedModel, setFormSelectedModel] = useState('gemini-3.8-flash-high');
  const [formMode, setFormMode] = useState<AppSettings['mode']>('auto');
  const [formEffort, setFormEffort] = useState<AppSettings['effort']>('high');
  const [formDanger, setFormDanger] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'remote'>('general');

  useEffect(() => {
    if (isOpen) {
      setFormApiKey(settings.apiKey);
      setFormSelectedModel(settings.selectedModel);
      setFormMode(settings.mode);
      setFormEffort(settings.effort);
      setFormDanger(settings.dangerouslySkipPermissions);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      apiKey: formApiKey.trim(),
      selectedModel: formSelectedModel,
      mode: formMode,
      effort: formEffort,
      dangerouslySkipPermissions: formDanger,
    });
    onClose();
  };

  const effortLevels: Array<{ id: AppSettings['effort']; label: string }> = [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'X-High' },
    { id: 'max', label: 'Max' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-sans">
      <div className="bg-[#0b0d14] border border-white/[0.08] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/20">
              <SlidersHorizontal size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Paramètres & Configuration</h2>
              <p className="text-[11px] text-zinc-500">
                Personnalisez le comportement de l'agent Antigravity
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

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] px-6 text-xs font-semibold bg-[#080a10]">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'general'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-200'
            }`}
          >
            Général & Agent
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('remote')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'remote'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-200'
            }`}
          >
            Accès Distant (Tailscale)
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto text-xs">
          {activeTab === 'general' ? (
            <>
              {/* API Key */}
              <div className="space-y-1.5">
                <label
                  htmlFor="setting-api-key"
                  className="font-semibold text-zinc-200 flex items-center gap-1.5"
                >
                  <Key size={13} className="text-violet-400" />
                  Clé d'authentification API
                </label>
                <input
                  id="setting-api-key"
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder="Bearer token ou clé secrète personnelle"
                  className="w-full bg-[#06070b] border border-white/[0.08] focus:border-violet-500 text-zinc-100 rounded-xl px-3.5 py-2.5 outline-none font-mono text-xs transition-colors"
                />
              </div>

              {/* Default Model */}
              <div className="space-y-1.5">
                <label
                  htmlFor="setting-model"
                  className="font-semibold text-zinc-200 flex items-center gap-1.5"
                >
                  <Cpu size={13} className="text-cyan-400" />
                  Modèle par défaut
                </label>
                <select
                  id="setting-model"
                  value={formSelectedModel}
                  onChange={(e) => setFormSelectedModel(e.target.value)}
                  className="w-full bg-[#06070b] border border-white/[0.08] focus:border-violet-500 text-zinc-100 rounded-xl px-3.5 py-2.5 outline-none cursor-pointer"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id} className="bg-[#0b0d14]">
                      {model.name}
                    </option>
                  ))}
                  {models.length === 0 && (
                    <option value="gemini-3.8-flash-high" className="bg-[#0b0d14]">
                      Gemini 3.8 Flash (High)
                    </option>
                  )}
                </select>
              </div>

              {/* Execution Mode Cards */}
              <div className="space-y-2">
                <span className="block font-semibold text-zinc-200">Mode d'exécution</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'auto', title: 'Auto', desc: 'Exécution autonome' },
                    { id: 'accept-edits', title: 'Review', desc: 'Valide les éditions' },
                    { id: 'plan', title: 'Plan', desc: 'Planification seule' },
                  ].map((modeItem) => (
                    <button
                      key={modeItem.id}
                      type="button"
                      onClick={() => setFormMode(modeItem.id as AppSettings['mode'])}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        formMode === modeItem.id
                          ? 'bg-violet-600/15 border-violet-500 text-white'
                          : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="font-bold text-xs">{modeItem.title}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{modeItem.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reasoning Effort Pills */}
              <div className="space-y-2">
                <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Zap size={13} className="text-amber-400" />
                  Puissance de réflexion (Reasoning Effort)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {effortLevels.map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setFormEffort(lvl.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        formEffort === lvl.id
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dangerously Skip Permissions */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                <div className="space-y-0.5">
                  <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Shield size={13} className="text-rose-400" />
                    Exécution autonome des outils
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    Autorise l'agent à exécuter les commandes sans confirmation manuelle
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formDanger}
                  onChange={(e) => setFormDanger(e.target.checked)}
                  className="w-4 h-4 rounded-sm accent-violet-600 cursor-pointer"
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                  <Globe size={15} className="text-cyan-400" />
                  Réseau Maillé Sécurisé
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Votre cockpit Antigravity est accessible depuis n'importe lequel de vos appareils (Mac, PC, iPhone, Android) via votre réseau privé Tailscale.
                </p>
                <div className="pt-2">
                  <span className="text-[10px] text-zinc-500 block">URL locale et sécurisée</span>
                  <code className="text-[11px] text-cyan-300 font-mono bg-black/40 px-2.5 py-1 rounded-lg block mt-1 select-all">
                    http://localhost:3000
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/[0.06] flex items-center justify-end gap-2.5 bg-white/[0.01]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-lg shadow-violet-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Save size={13} />
            <span>Enregistrer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
