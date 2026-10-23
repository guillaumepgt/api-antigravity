<script lang="ts">
  import type { AppSettings, Model } from './types';
  import { X, Key, Shield, SlidersHorizontal, Globe, Save, Cpu, Zap } from 'lucide-svelte';

  interface Props {
    settings: AppSettings;
    models: Model[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (newSettings: AppSettings) => void;
  }

  let {
    settings,
    models,
    isOpen,
    onClose,
    onSave,
  }: Props = $props();

  let formApiKey = $state('');
  let formSelectedModel = $state('gemini-3.8-flash-high');
  let formMode = $state<AppSettings['mode']>('auto');
  let formEffort = $state<AppSettings['effort']>('high');
  let formDanger = $state(true);
  let activeTab = $state<'general' | 'remote'>('general');

  $effect(() => {
    if (isOpen) {
      formApiKey = settings.apiKey;
      formSelectedModel = settings.selectedModel;
      formMode = settings.mode;
      formEffort = settings.effort;
      formDanger = settings.dangerouslySkipPermissions;
    }
  });

  function handleSave() {
    onSave({
      apiKey: formApiKey.trim(),
      selectedModel: formSelectedModel,
      mode: formMode,
      effort: formEffort,
      dangerouslySkipPermissions: formDanger,
    });
    onClose();
  }

  const effortLevels: Array<{ id: AppSettings['effort']; label: string }> = [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'X-High' },
    { id: 'max', label: 'Max' },
  ];
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-sans">
    <div class="bg-[#0b0d14] border border-white/[0.08] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/20">
            <SlidersHorizontal size={16} />
          </div>
          <div>
            <h2 class="text-sm font-bold text-white">Paramètres & Configuration</h2>
            <p class="text-[11px] text-zinc-500">
              Personnalisez le comportement de l'agent Antigravity
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1.5 rounded-xl hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-white/[0.06] px-6 text-xs font-semibold bg-[#080a10]">
        <button
          type="button"
          onclick={() => (activeTab = 'general')}
          class="py-3 px-4 border-b-2 transition-colors cursor-pointer {activeTab === 'general' ? 'border-violet-500 text-violet-400' : 'border-transparent text-zinc-500 hover:text-zinc-200'}"
        >
          Général & Agent
        </button>
        <button
          type="button"
          onclick={() => (activeTab = 'remote')}
          class="py-3 px-4 border-b-2 transition-colors cursor-pointer {activeTab === 'remote' ? 'border-violet-500 text-violet-400' : 'border-transparent text-zinc-500 hover:text-zinc-200'}"
        >
          Accès Distant (Tailscale)
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-5 max-h-[72vh] overflow-y-auto text-xs">
        {#if activeTab === 'general'}
          <!-- API Key -->
          <div class="space-y-1.5">
            <label
              for="setting-api-key"
              class="font-semibold text-zinc-200 flex items-center gap-1.5"
            >
              <Key size={13} className="text-violet-400" />
              Clé d'authentification API
            </label>
            <input
              id="setting-api-key"
              type="password"
              bind:value={formApiKey}
              placeholder="Bearer token ou clé secrète personnelle"
              class="w-full bg-[#06070b] border border-white/[0.08] focus:border-violet-500 text-zinc-100 rounded-xl px-3.5 py-2.5 outline-none font-mono text-xs transition-colors"
            />
          </div>

          <!-- Default Model -->
          <div class="space-y-1.5">
            <label
              for="setting-model"
              class="font-semibold text-zinc-200 flex items-center gap-1.5"
            >
              <Cpu size={13} className="text-cyan-400" />
              Modèle par défaut
            </label>
            <select
              id="setting-model"
              bind:value={formSelectedModel}
              class="w-full bg-[#06070b] border border-white/[0.08] focus:border-violet-500 text-zinc-100 rounded-xl px-3.5 py-2.5 outline-none cursor-pointer"
            >
              {#each models as model}
                <option value={model.id} class="bg-[#0b0d14]">
                  {model.name}
                </option>
              {/each}
            </select>
          </div>

          <!-- Execution Mode Cards -->
          <div class="space-y-2">
            <span class="block font-semibold text-zinc-200">Mode d'exécution</span>
            <div class="grid grid-cols-3 gap-2">
              {#each [
                { id: 'auto', title: 'Auto', desc: 'Exécution autonome' },
                { id: 'accept-edits', title: 'Review', desc: 'Valide les éditions' },
                { id: 'plan', title: 'Plan', desc: 'Planification seule' },
              ] as modeItem}
                <button
                  type="button"
                  onclick={() => (formMode = modeItem.id as AppSettings['mode'])}
                  class="p-3 rounded-xl border text-left transition-all cursor-pointer {formMode === modeItem.id ? 'bg-violet-600/15 border-violet-500 text-white' : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]'}"
                >
                  <div class="font-bold text-xs">{modeItem.title}</div>
                  <div class="text-[10px] text-zinc-500 mt-0.5">{modeItem.desc}</div>
                </button>
              {/each}
            </div>
          </div>

          <!-- Reasoning Effort Pills -->
          <div class="space-y-2">
            <span class="font-semibold text-zinc-200 flex items-center gap-1.5">
              <Zap size={13} class="text-amber-400" />
              Puissance de réflexion (Reasoning Effort)
            </span>
            <div class="grid grid-cols-5 gap-1.5 bg-[#06070b] p-1.5 rounded-xl border border-white/[0.06]">
              {#each effortLevels as item}
                <button
                  type="button"
                  onclick={() => (formEffort = item.id)}
                  class="py-2 rounded-lg font-semibold text-[11px] transition-all cursor-pointer {formEffort === item.id ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xs' : 'text-zinc-400 hover:text-white'}"
                >
                  {item.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Dangerously Skip Permissions Toggle -->
          <label class="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={formDanger}
              class="mt-0.5 rounded bg-black border-amber-500/40 text-violet-600 focus:ring-0"
            />
            <div>
              <span class="font-semibold text-amber-200 flex items-center gap-1.5">
                <Shield size={14} class="text-amber-400" />
                Approbation automatique des outils
              </span>
              <p class="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Active{' '}
                <code class="bg-black/40 px-1.5 py-0.5 rounded text-amber-300 font-mono">
                  --dangerously-skip-permissions
                </code>{' '}
                pour permettre à l'agent d'exécuter ses commandes sans blocage interactif.
              </p>
            </div>
          </label>
        {:else}
          <!-- Tailscale Remote Guide -->
          <div class="space-y-3.5 text-zinc-300 leading-relaxed">
            <div class="flex items-center gap-2 font-bold text-violet-300 text-sm">
              <Globe size={16} />
              Accès mobile & distant via Tailscale
            </div>
            <p class="text-zinc-400">
              Connectez-vous à votre instance Antigravity depuis votre smartphone ou un terminal distant en toute sécurité sans ouvrir de ports sur votre réseau.
            </p>

            <div class="bg-[#050609] rounded-2xl p-4 border border-white/[0.07] font-mono text-[11px] space-y-1.5">
              <div class="text-zinc-500"># 1. Installer Tailscale sur la machine hôte</div>
              <div class="text-emerald-400">curl -fsSL https://tailscale.com/install.sh | sh</div>
              <div class="text-zinc-500 pt-2"># 2. Activer le tunnel chiffré</div>
              <div class="text-emerald-400">sudo tailscale up</div>
              <div class="text-zinc-500 pt-2"># 3. Récupérer l'IP privée 100.x.y.z</div>
              <div class="text-emerald-400">tailscale ip -4</div>
            </div>

            <div class="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[11px]">
              Accédez ensuite à l'adresse <code>http://&lt;TAILSCALE_IP&gt;:3000</code> depuis Safari iOS, Chrome Android ou votre ordinateur distant !
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2.5 bg-[#080a10]">
        <button
          type="button"
          onclick={onClose}
          class="px-4 py-2 rounded-xl border border-white/[0.08] hover:bg-white/[0.05] text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
        >
          Annuler
        </button>
        <button
          type="button"
          onclick={handleSave}
          class="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-violet-600/25 transition-all cursor-pointer"
        >
          <Save size={14} />
          <span>Enregistrer</span>
        </button>
      </div>
    </div>
  </div>
{/if}
