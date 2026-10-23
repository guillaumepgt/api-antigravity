<script lang="ts">
  import type { AppSettings, Model } from './types';
  import { X, Key, Shield, Sliders, Globe, Save, Cpu } from 'lucide-svelte';

  interface Props {
    settings: AppSettings;
    models?: Model[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (newSettings: AppSettings) => void;
  }

  let { settings, models = [], isOpen, onClose, onSave }: Props = $props();

  let formApiKey = $state('');
  let formSelectedModel = $state('gemini-3.8-flash-high');
  let formMode = $state<'auto' | 'accept-edits' | 'plan'>('auto');
  let formEffort = $state<'low' | 'medium' | 'high' | 'xhigh' | 'max'>('high');
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

  function handleModelChange(newModel: string) {
    formSelectedModel = newModel;
    if (newModel.endsWith('-low')) formEffort = 'low';
    else if (newModel.endsWith('-medium')) formEffort = 'medium';
    else if (newModel.endsWith('-high')) formEffort = 'high';
    else if (newModel.endsWith('-xhigh')) formEffort = 'xhigh';
    else if (newModel.endsWith('-max')) formEffort = 'max';
  }

  function handleEffortChange(newEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max') {
    formEffort = newEffort;
    if (formSelectedModel.startsWith('gemini-3.8-flash-')) {
      if (newEffort === 'low' || newEffort === 'medium' || newEffort === 'high') {
        formSelectedModel = `gemini-3.8-flash-${newEffort}`;
      }
    }
  }

  function handleSave() {
    onSave({
      ...settings,
      apiKey: formApiKey.trim(),
      selectedModel: formSelectedModel,
      mode: formMode,
      effort: formEffort,
      dangerouslySkipPermissions: formDanger,
    });
    onClose();
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
    <!-- Modal Dialog -->
    <div class="bg-[#12151f] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Sliders size={16} class="text-blue-400" />
          Settings & Remote Access
        </h2>
        <button
          type="button"
          onclick={onClose}
          class="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-slate-800 px-5 text-xs font-medium">
        <button
          type="button"
          onclick={() => activeTab = 'general'}
          class="py-2.5 px-3 border-b-2 transition-colors {activeTab === 'general' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          General & Security
        </button>
        <button
          type="button"
          onclick={() => activeTab = 'remote'}
          class="py-2.5 px-3 border-b-2 transition-colors {activeTab === 'remote' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          Remote Access (Tailscale)
        </button>
      </div>

      <!-- Tab Content -->
      <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
        {#if activeTab === 'general'}
          <!-- API Key -->
          <div>
            <label for="setting-api-key" class="block font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Key size={13} class="text-indigo-400" />
              API Key (Authorization Token)
            </label>
            <input
              id="setting-api-key"
              type="password"
              bind:value={formApiKey}
              placeholder="Enter your secret API key (configured in API_KEY env var)"
              class="w-full bg-[#181c28] border border-slate-800 text-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
            />
            <p class="text-[11px] text-slate-500 mt-1">
              Required if API_KEY is set on the Rust backend. Leave blank if running locally without authentication.
            </p>
          </div>

          <!-- Model Selection -->
          <div>
            <label for="setting-model" class="block font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Cpu size={13} class="text-indigo-400" />
              Modèle d'IA par défaut
            </label>
            <select
              id="setting-model"
              value={formSelectedModel}
              onchange={(e) => handleModelChange((e.target as HTMLSelectElement).value)}
              class="w-full bg-[#181c28] border border-slate-800 text-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
            >
              {#each models as model}
                <option value={model.id}>{model.name}</option>
              {/each}
              {#if models.length === 0}
                <option value="gemini-3.8-flash-high">Gemini 3.8 Flash (High)</option>
                <option value="gemini-3.8-flash-medium">Gemini 3.8 Flash (Medium)</option>
                <option value="gemini-3.8-flash-low">Gemini 3.8 Flash (Low)</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Thinking)</option>
              {/if}
            </select>
          </div>

          <!-- Execution Mode -->
          <div>
            <label for="setting-mode" class="block font-medium text-slate-300 mb-1">Agent Mode</label>
            <select
              id="setting-mode"
              bind:value={formMode}
              class="w-full bg-[#181c28] border border-slate-800 text-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="auto">auto (Autonomous agent execution)</option>
              <option value="accept-edits">accept-edits (Interactive review)</option>
              <option value="plan">plan (Planning mode only)</option>
            </select>
          </div>

          <!-- Reasoning Effort -->
          <div>
            <label for="setting-effort" class="block font-medium text-slate-300 mb-1">Niveau de Réflexion (Reasoning Effort)</label>
            <select
              id="setting-effort"
              value={formEffort}
              onchange={(e) => handleEffortChange((e.target as HTMLSelectElement).value as any)}
              class="w-full bg-[#181c28] border border-slate-800 text-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="low">low (Rapide, réflexion minimale)</option>
              <option value="medium">medium (Équilibré)</option>
              <option value="high">high (Par défaut, réflexion approfondie)</option>
              <option value="xhigh">xhigh (Réflexion extra haute)</option>
              <option value="max">max (Réflexion maximale)</option>
            </select>
          </div>

          <!-- Auto approve tools -->
          <div class="pt-2">
            <label class="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={formDanger}
                class="mt-0.5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
              />
              <div>
                <span class="font-medium text-slate-200 flex items-center gap-1.5">
                  <Shield size={14} class="text-amber-400" />
                  Auto-Approve Tool Execution
                </span>
                <p class="text-[11px] text-slate-400 mt-0.5 leading-normal">
                  Passes <code class="bg-slate-800 px-1 py-0.5 rounded text-slate-300">--dangerously-skip-permissions</code> so the agent can execute commands and write files without interactive terminal prompts. Recommended for remote headless API usage.
                </p>
              </div>
            </label>
          </div>
        {:else}
          <!-- Remote Access tab -->
          <div class="space-y-3 text-slate-300 leading-relaxed">
            <div class="flex items-center gap-2 font-medium text-indigo-400 text-sm">
              <Globe size={16} />
              Connect From Anywhere via Tailscale
            </div>
            <p>
              With <strong>Tailscale</strong>, you can securely connect to this Antigravity instance from your phone, laptop, or any remote browser without opening ports on your home router.
            </p>

            <div class="bg-slate-900/80 rounded-xl p-3 border border-slate-800 font-mono text-[11px] space-y-1">
              <div class="text-slate-400"># Step 1: Install Tailscale on host machine</div>
              <div class="text-emerald-400">curl -fsSL https://tailscale.com/install.sh | sh</div>
              <div class="text-slate-400 mt-2"># Step 2: Connect host to your tailnet</div>
              <div class="text-emerald-400">sudo tailscale up</div>
              <div class="text-slate-400 mt-2"># Step 3: Get your machine's 100.x.y.z Tailscale IP</div>
              <div class="text-emerald-400">tailscale ip -4</div>
            </div>

            <p class="text-[11px] text-slate-400">
              Once connected, open <code class="text-blue-400">http://&lt;your-tailscale-ip&gt;:3000</code> in your mobile or laptop browser from anywhere in the world!
            </p>
          </div>
        {/if}
      </div>

      <!-- Footer Buttons -->
      <div class="px-5 py-3 border-t border-slate-800 flex items-center justify-end gap-2 bg-[#0d1017]">
        <button
          type="button"
          onclick={onClose}
          class="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={handleSave}
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
        >
          <Save size={14} />
          Save Settings
        </button>
      </div>
    </div>
  </div>
{/if}
