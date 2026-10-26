<script lang="ts">
  import { Terminal, Maximize2, Minimize2, X } from 'lucide-svelte';
  import { terminalState } from './state/terminalState.svelte';
  import { authState } from './state/authState.svelte';

  interface Props {
    onLoginSuccess?: () => Promise<void>;
  }

  let { onLoginSuccess }: Props = $props();
</script>

{#if terminalState.isOpen}
  <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 font-mono">
    <div
      class="bg-[#050609] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 {terminalState.isMaximized ? 'w-full h-full' : 'w-full max-w-4xl h-[85vh]'}"
    >
      <!-- Terminal Header -->
      <div class="bg-[#0b0e17] px-4 py-3 border-b border-white/[0.08] flex items-center justify-between select-none">
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5 mr-2">
            <button
              type="button"
              onclick={() => terminalState.closeTerminal()}
              class="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-500 inline-block cursor-pointer"
              title="Fermer"
            ></button>
            <button
              type="button"
              onclick={() => terminalState.toggleMaximized()}
              class="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 inline-block cursor-pointer"
              title="Agrandir"
            ></button>
            <span class="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>

          <div class="flex items-center gap-2 text-xs text-zinc-300">
            <Terminal size={14} class="text-cyan-400" />
            <span class="font-semibold text-zinc-200">
              {terminalState.activeLoginId ? 'oauth — Connexion Google Antigravity' : 'bash — antigravity-worker-01'}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          {#if terminalState.activeLoginId}
            <button
              type="button"
              onclick={async () => {
                await terminalState.validateLoginManually(async () => {
                  if (onLoginSuccess) {
                    await onLoginSuccess();
                  } else {
                    await authState.initAuth();
                  }
                });
              }}
              class="px-3 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              Valider ma connexion
            </button>
          {/if}
          <button
            type="button"
            onclick={() => terminalState.toggleMaximized()}
            class="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
          >
            {#if terminalState.isMaximized}
              <Minimize2 size={14} />
            {:else}
              <Maximize2 size={14} />
            {/if}
          </button>
          <button
            type="button"
            onclick={() => terminalState.closeTerminal()}
            class="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>
      <iframe
        src={terminalState.terminalUrl}
        class="flex-1 w-full h-full border-none bg-black"
        title="Terminal d'authentification Antigravity"
      ></iframe>
    </div>
  </div>
{/if}
