<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import MessageItem from './lib/Message.svelte';
  import InputBar from './lib/InputBar.svelte';
  import SettingsModal from './lib/SettingsModal.svelte';
  import ApiKeyModal from './lib/ApiKeyModal.svelte';
  import {
    checkHealth,
    checkAuthStatus,
    fetchConversations,
    fetchModels,
    fetchTranscript,
    fetchUserKey,
    getStoredSettings,
    saveStoredSettings,
    streamChat,
    type UserKeyInfo,
  } from './lib/api';
  import type { AppSettings, Conversation, Message, Model } from './lib/types';
  import { Bot, AlertCircle, Menu, X, Terminal, ShieldCheck, KeyRound, Key, MessageSquare } from 'lucide-svelte';

  let settings = $state<AppSettings>(getStoredSettings());
  let conversations = $state<Conversation[]>([]);
  let models = $state<Model[]>([]);
  let currentConversationId = $state<string | null>(null);
  let messages = $state<Message[]>([]);
  let isStreaming = $state(false);
  let isConnected = $state(false);
  let isAuthenticated = $state(true);
  let isTerminalOpen = $state(false);
  let isSettingsOpen = $state(false);
  let isApiKeyModalOpen = $state(false);
  let keyInfo = $state<UserKeyInfo | null>(null);
  let sidebarOpenMobile = $state(false);
  let chatContainerEl = $state<HTMLDivElement | null>(null);

  let currentAbortController: AbortController | null = null;

  let currentModelName = $derived(
    models.find(m => m.id === settings.selectedModel)?.name || settings.selectedModel
  );

  onMount(async () => {
    await initApp();
  });

  async function initApp() {
    try {
      await checkHealth(settings.apiKey);
      isConnected = true;
    } catch (e) {
      console.warn('Initial health check failed:', e);
      isConnected = false;
    }

    try {
      const auth = await checkAuthStatus(settings.apiKey);
      isAuthenticated = auth.authenticated;
    } catch {
      isAuthenticated = false;
    }

    try {
      const fetchedKeyInfo = await fetchUserKey();
      keyInfo = fetchedKeyInfo;
      if (fetchedKeyInfo?.api_key && (!settings.apiKey || settings.apiKey.trim() === '')) {
        settings.apiKey = fetchedKeyInfo.api_key;
        saveStoredSettings(settings);
      }
    } catch (e) {
      console.warn('Could not fetch user API key:', e);
    }

    try {
      const [fetchedModels, fetchedConvs] = await Promise.all([
        fetchModels(settings.apiKey).catch(() => []),
        fetchConversations(settings.apiKey).catch(() => []),
      ]);

      models = fetchedModels;
      conversations = fetchedConvs;

      // Select first model if current isn't in catalog
      if (models.length > 0 && !models.some(m => m.id === settings.selectedModel)) {
        settings.selectedModel = models[0].id;
        saveStoredSettings(settings);
      }
    } catch (e) {
      console.error('Error during app init:', e);
    }
  }

  async function scrollToBottom() {
    await tick();
    if (chatContainerEl) {
      chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
    }
  }

  async function handleSelectConversation(id: string) {
    if (isStreaming) return;
    currentConversationId = id;
    sidebarOpenMobile = false;
    messages = [];

    try {
      const res = await fetchTranscript(id, settings.apiKey);
      const steps = res.steps || [];
      const parsedMessages: Message[] = [];

      for (const step of steps) {
        if (step.type === 'USER_INPUT' && step.content) {
          // Clean possible XML wrapper tags from CLI
          let cleanContent = step.content;
          const match = step.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
          if (match && match[1]) {
            cleanContent = match[1].trim();
          }

          parsedMessages.push({
            id: `user-${step.step_index}`,
            role: 'user',
            content: cleanContent,
          });
        } else if (step.type === 'PLANNER_RESPONSE') {
          parsedMessages.push({
            id: `assistant-${step.step_index}`,
            role: 'assistant',
            content: step.content || '',
            thought: step.thinking || undefined,
            usage: {
              input_tokens: step.input_tokens,
              output_tokens: step.output_tokens,
              total_tokens: (step.input_tokens || 0) + (step.output_tokens || 0),
            },
          });
        }
      }

      messages = parsedMessages;
      await scrollToBottom();
    } catch (e) {
      console.error('Failed to load conversation transcript:', e);
    }
  }

  function handleNewChat() {
    if (isStreaming) return;
    currentConversationId = null;
    messages = [];
    sidebarOpenMobile = false;
  }

  function handleSelectModel(modelId: string) {
    settings.selectedModel = modelId;
    saveStoredSettings(settings);
  }

  function handleSaveSettings(newSettings: AppSettings) {
    settings = newSettings;
    saveStoredSettings(settings);
    initApp();
  }

  function handleStop() {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    isStreaming = false;
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      messages[messages.length - 1].isStreaming = false;
    }
  }

  async function handleSend(promptText: string) {
    if (!promptText.trim() || isStreaming) return;

    // Push user message
    messages.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText,
    });

    // Create assistant message placeholder
    const assistantMsgIndex = messages.length;
    messages.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      toolCalls: [],
    });

    isStreaming = true;
    await scrollToBottom();

    currentAbortController = new AbortController();

    try {
      await streamChat(
        promptText,
        {
          conversationId: currentConversationId || undefined,
          model: settings.selectedModel,
          mode: settings.mode,
          effort: settings.effort,
          dangerouslySkipPermissions: settings.dangerouslySkipPermissions,
          apiKey: settings.apiKey,
        },
        {
          onInit: (data) => {
            if (data.conversation_id && !currentConversationId) {
              currentConversationId = data.conversation_id;
              // Refresh conversation list in background
              fetchConversations(settings.apiKey)
                .then(c => conversations = c)
                .catch(() => {});
            }
          },
          onDelta: (delta) => {
            if (messages[assistantMsgIndex]) {
              messages[assistantMsgIndex].content += delta;
              scrollToBottom();
            }
          },
          onThought: (thoughtDelta) => {
            if (messages[assistantMsgIndex]) {
              messages[assistantMsgIndex].thought =
                (messages[assistantMsgIndex].thought || '') + thoughtDelta;
            }
          },
          onToolCall: (toolCall) => {
            if (messages[assistantMsgIndex]) {
              const currentTools = messages[assistantMsgIndex].toolCalls || [];
              messages[assistantMsgIndex].toolCalls = [...currentTools, toolCall];
            }
          },
          onResult: (result) => {
            if (messages[assistantMsgIndex]) {
              if (result.response && !messages[assistantMsgIndex].content) {
                messages[assistantMsgIndex].content = result.response;
              }
              if (result.usage) {
                messages[assistantMsgIndex].usage = result.usage;
              }
            }
          },
          onError: (errMsg) => {
            if (messages[assistantMsgIndex]) {
              messages[assistantMsgIndex].content += `\n\n> ⚠️ **Error:** ${errMsg}`;
            }
          },
          onDone: () => {
            if (messages[assistantMsgIndex]) {
              messages[assistantMsgIndex].isStreaming = false;
            }
            isStreaming = false;
            currentAbortController = null;
            // Update conversations list
            fetchConversations(settings.apiKey)
              .then(c => conversations = c)
              .catch(() => {});
          },
        },
        currentAbortController.signal
      );
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        if (messages[assistantMsgIndex]) {
          messages[assistantMsgIndex].content += `\n\n> ⚠️ **Request Failed:** ${(e as Error)?.message}`;
          messages[assistantMsgIndex].isStreaming = false;
        }
      }
    } finally {
      isStreaming = false;
      currentAbortController = null;
      if (messages[assistantMsgIndex]) {
        messages[assistantMsgIndex].isStreaming = false;
      }
      await scrollToBottom();
    }
  }
</script>

<div class="flex h-screen w-screen overflow-hidden bg-[#0c0e15] text-slate-100">
  <!-- Desktop & Mobile Sidebar -->
  <div class="hidden md:flex h-full">
    <Sidebar
      {conversations}
      {currentConversationId}
      {models}
      selectedModel={settings.selectedModel}
      {isConnected}
      {isAuthenticated}
      onSelectConversation={handleSelectConversation}
      onNewChat={handleNewChat}
      onSelectModel={handleSelectModel}
      onOpenSettings={() => isSettingsOpen = true}
      onOpenTerminal={() => isTerminalOpen = true}
      onOpenApiKeyModal={() => isApiKeyModalOpen = true}
      onRefresh={initApp}
    />
  </div>

  {#if sidebarOpenMobile}
    <div class="fixed inset-0 z-40 flex md:hidden bg-black/60 backdrop-blur-xs">
      <div class="relative flex-1 max-w-xs w-full bg-[#0c0e15] h-full shadow-2xl">
        <button
          type="button"
          onclick={() => sidebarOpenMobile = false}
          class="absolute top-4 right-3 p-1 rounded-lg text-slate-400 hover:text-white"
        >
          <X size={18} />
        </button>
        <Sidebar
          {conversations}
          {currentConversationId}
          {models}
          selectedModel={settings.selectedModel}
          {isConnected}
          {isAuthenticated}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onSelectModel={handleSelectModel}
          onOpenSettings={() => {
            sidebarOpenMobile = false;
            isSettingsOpen = true;
          }}
          onOpenTerminal={() => {
            sidebarOpenMobile = false;
            isTerminalOpen = true;
          }}
          onOpenApiKeyModal={() => {
            sidebarOpenMobile = false;
            isApiKeyModalOpen = true;
          }}
          onRefresh={initApp}
        />
      </div>
    </div>
  {/if}

  <!-- Main Content View -->
  <main class="flex-1 flex flex-col h-full min-w-0 bg-[#0f111a] relative">
    <!-- Top Bar (Mobile + status) -->
    <header class="h-14 border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0 bg-[#0c0e15]/60 backdrop-blur-md">
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={() => sidebarOpenMobile = true}
          class="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white md:hidden"
        >
          <Menu size={18} />
        </button>
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold tracking-tight text-slate-200">
            {currentModelName}
          </span>
          <span class="text-xs text-slate-500 font-mono hidden sm:inline">
            mode: {settings.mode}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#if !isConnected}
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950/60 border border-red-800/60 text-red-400 text-xs">
            <AlertCircle size={13} />
            <span class="hidden sm:inline">Backend unreachable</span>
          </div>
        {/if}

        <a
          href="/whatsapp/"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/60 hover:bg-emerald-900/60 text-emerald-300 text-xs font-medium transition-all cursor-pointer shadow-sm"
          title="Connecter mon WhatsApp au serveur Antigravity"
        >
          <MessageSquare size={13} />
          <span class="hidden sm:inline">WhatsApp</span>
        </a>

        <button
          type="button"
          onclick={() => isApiKeyModalOpen = true}
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-700/60 hover:bg-indigo-900/60 text-indigo-300 text-xs font-medium transition-all cursor-pointer shadow-sm"
          title="Afficher ma clé API & exemples curl/python"
        >
          <Key size={13} />
          <span class="hidden sm:inline">Clé API</span>
        </button>
      </div>
    </header>

    {#if !isAuthenticated && isConnected}
      <div class="m-3 p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-lg">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
            <KeyRound size={18} />
          </div>
          <div>
            <h3 class="text-xs font-semibold text-amber-200">Connexion Google requise (Sans clé API)</h3>
            <p class="text-[11px] text-amber-300/80 mt-0.5">
              Connectez votre propre compte Google pour utiliser Antigravity gratuitement et accéder à tous les modèles.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onclick={() => isTerminalOpen = true}
            class="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Terminal size={13} />
            <span>Se connecter (Terminal Web)</span>
          </button>
          <button
            type="button"
            onclick={initApp}
            class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
            title="Vérifier la connexion"
          >
            Vérifier
          </button>
        </div>
      </div>
    {/if}

    <!-- Message Scroll Area -->
    <div
      bind:this={chatContainerEl}
      class="flex-1 overflow-y-auto px-2 sm:px-4 py-6 scroll-smooth"
    >
      {#if messages.length === 0}
        <div class="h-full flex flex-col items-center justify-center text-center px-4 max-w-lg mx-auto select-none">
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/20 mb-4">
            <Bot size={28} />
          </div>
          <h2 class="text-xl font-bold text-slate-100 tracking-tight">Antigravity Remote Agent</h2>
          <p class="text-xs text-slate-400 mt-2 leading-relaxed">
            Ready to navigate your codebase, edit files, execute commands, and run subagents anywhere via Docker and Tailscale.
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-8 w-full text-left">
            <button
              type="button"
              onclick={() => handleSend("Explain what is in this workspace and summarize the architecture.")}
              class="p-3 rounded-xl bg-[#181c28] border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/60 text-xs text-slate-300 transition-all cursor-pointer"
            >
              <div class="font-medium text-slate-200">🔍 Inspect Workspace</div>
              <div class="text-[11px] text-slate-500 mt-0.5">Explore files and architecture</div>
            </button>
            <button
              type="button"
              onclick={() => handleSend("What tools and capabilities do you have available?")}
              class="p-3 rounded-xl bg-[#181c28] border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/60 text-xs text-slate-300 transition-all cursor-pointer"
            >
              <div class="font-medium text-slate-200">⚡ Check Capabilities</div>
              <div class="text-[11px] text-slate-500 mt-0.5">List available tools and agents</div>
            </button>
          </div>
        </div>
      {:else}
        {#each messages as msg (msg.id)}
          <MessageItem message={msg} />
        {/each}
      {/if}
    </div>

    <!-- Input Bar -->
    <InputBar
      {isStreaming}
      disabled={!isConnected}
      dangerMode={settings.dangerouslySkipPermissions}
      modelName={currentModelName}
      onSend={handleSend}
      onStop={handleStop}
    />
  </main>

  <!-- Settings Modal -->
  <SettingsModal
    isOpen={isSettingsOpen}
    {settings}
    onClose={() => isSettingsOpen = false}
    onSave={handleSaveSettings}
  />

  <!-- Interactive Web Terminal Modal for Google OAuth Login -->
  {#if isTerminalOpen}
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div class="bg-[#10131d] border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-[#0a0c13]">
          <div class="flex items-center gap-2">
            <Terminal size={16} class="text-blue-400" />
            <span class="text-xs font-semibold text-slate-200">Terminal Web d'Authentification Antigravity</span>
            <span class="text-[10px] text-slate-500 font-mono hidden sm:inline">(Port 7681)</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={async () => {
                await initApp();
                if (isAuthenticated) isTerminalOpen = false;
              }}
              class="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all"
            >
              Vérifier connexion
            </button>
            <button
              type="button"
              onclick={() => isTerminalOpen = false}
              class="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <iframe
          src="/terminal/"
          class="flex-1 w-full h-full border-none bg-black"
          title="Terminal d'authentification Antigravity"
        ></iframe>
      </div>
    </div>
  {/if}

  <!-- API Key & Developer Code Modal -->
  <ApiKeyModal
    isOpen={isApiKeyModalOpen}
    {keyInfo}
    {isAuthenticated}
    onClose={() => isApiKeyModalOpen = false}
    onKeyUpdated={(newKey) => {
      if (keyInfo) keyInfo.api_key = newKey;
      settings.apiKey = newKey;
      saveStoredSettings(settings);
    }}
  />
</div>
