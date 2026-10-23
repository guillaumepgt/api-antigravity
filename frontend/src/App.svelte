<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import MainPage from './lib/MainPage.svelte';
  import MessageItem from './lib/Message.svelte';
  import InputBar from './lib/InputBar.svelte';
  import SettingsModal from './lib/SettingsModal.svelte';
  import ApiKeyModal from './lib/ApiKeyModal.svelte';
  import {
    checkHealth,
    fetchMe,
    startGoogleLogin,
    pollLogin,
    openUserTerminal,
    logoutSession,
    fetchConversations,
    fetchModels,
    fetchTranscript,
    fetchUserKey,
    deleteConversation,
    clearAllConversations,
    getStoredSettings,
    saveStoredSettings,
    streamChat,
    type UserKeyInfo,
  } from './lib/api';
  import type { AppSettings, Conversation, Message, Model } from './lib/types';
  import {
    Bot,
    Terminal,
    ShieldCheck,
    Key,
    User,
    LogOut,
    ArrowLeft,
    Plus,
    Cpu,
    X,
    Trash2,
  } from 'lucide-svelte';

  function checkHasStoredAuth(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const sess = localStorage.getItem('antigravity_session_token');
      if (sess && sess.trim()) return true;
      const rawSettings = localStorage.getItem('antigravity_settings');
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed?.apiKey && parsed.apiKey.trim()) return true;
      }
      if (document.cookie && document.cookie.includes('antigravity_session=')) return true;
    } catch {}
    return false;
  }

  let settings = $state<AppSettings>(getStoredSettings());
  let userEmail = $state<string>('');
  let userId = $state<string>('');
  let conversations = $state<Conversation[]>([]);
  let models = $state<Model[]>([]);
  let currentConversationId = $state<string | null>(null);
  let messages = $state<Message[]>([]);
  let isStreaming = $state(false);
  let isConnected = $state(false);
  let isCheckingAuth = $state(true);
  let isAuthenticated = $state(checkHasStoredAuth());
  let isLoadingTranscript = $state(false);
  let isChatMode = $state(false);
  let isTerminalOpen = $state(false);
  let terminalUrl = $state<string>('');
  let isLoggingIn = $state(false);
  let isSettingsOpen = $state(false);
  let isApiKeyModalOpen = $state(false);
  let keyInfo = $state<UserKeyInfo | null>(null);
  let chatContainerEl = $state<HTMLDivElement | null>(null);

  let activeLoginId = $state<string | null>(null);
  let loginPollingTimer: ReturnType<typeof setInterval> | null = null;
  let currentAbortController: AbortController | null = null;
  let initialPromptToSend: string | null = null;

  let currentModelName = $derived(
    models.find((m) => m.id === settings.selectedModel)?.name || settings.selectedModel
  );

  let currentConversationTitle = $derived(
    conversations.find((c) => c.conversation_id === currentConversationId)?.title ||
      (messages.length > 0 && messages[0].role === 'user' ? messages[0].content.slice(0, 30) : '')
  );

  let pageTitle = $derived.by(() => {
    if (!isChatMode) {
      return 'Antigravity - Cockpit';
    }
    if (currentConversationTitle) {
      return `${currentConversationTitle} - Antigravity`;
    }
    if (messages.length > 0 && messages[0].role === 'user') {
      return `${messages[0].content.slice(0, 30)} - Antigravity`;
    }
    return 'Nouveau Chat - Antigravity';
  });

  onMount(() => {
    // Check if URL specifies chat mode (?c=new or ?c=<conversation_id>)
    const params = new URLSearchParams(window.location.search);
    const cParam = params.get('c');
    const qParam = params.get('q');

    if (cParam !== null) {
      isChatMode = true;
      if (cParam !== 'new' && cParam.trim()) {
        const convId = cParam.trim();
        // Immediately fetch the transcript in parallel without waiting for anything else!
        handleSelectConversation(convId);
      }
      if (qParam && qParam.trim()) {
        initialPromptToSend = qParam.trim();
      }
    } else {
      isChatMode = false;
    }

    // Authenticate & load secondary metadata in parallel
    initApp();
  });

  async function initApp() {
    try {
      const [meResult, healthResult] = await Promise.allSettled([
        fetchMe(),
        checkHealth(),
      ]);

      if (healthResult.status === 'fulfilled') {
        isConnected = true;
      }

      if (meResult.status === 'fulfilled' && meResult.value.authenticated) {
        isAuthenticated = true;
        userEmail = meResult.value.email || '';
        userId = meResult.value.user_id || 'default';
      } else {
        isAuthenticated = false;
        isCheckingAuth = false;
        messages = [];
        conversations = [];
        return;
      }
    } catch {
      isAuthenticated = false;
      isCheckingAuth = false;
      return;
    } finally {
      isCheckingAuth = false;
    }

    // Secondary metadata in parallel
    try {
      const promises: Promise<unknown>[] = [
        fetchUserKey()
          .then((k) => {
            keyInfo = k;
            if (k?.api_key && (!settings.apiKey || settings.apiKey.trim() === '')) {
              settings.apiKey = k.api_key;
              saveStoredSettings(settings);
            }
          })
          .catch(() => {}),
        fetchModels(settings.apiKey)
          .then((m) => {
            models = m;
            if (m.length > 0 && !m.some((item) => item.id === settings.selectedModel)) {
              settings.selectedModel = m[0].id;
              saveStoredSettings(settings);
            }
          })
          .catch(() => {}),
      ];

      // Only fetch the full list of conversations if we are on the main page (not in standalone chat)
      if (!isChatMode) {
        promises.push(
          fetchConversations(settings.apiKey)
            .then((c) => {
              conversations = c;
            })
            .catch(() => {})
        );
      }

      await Promise.allSettled(promises);

      // If a prompt was queued for new chat (?c=new&q=...)
      if (isChatMode && initialPromptToSend) {
        const prompt = initialPromptToSend;
        initialPromptToSend = null;
        window.history.replaceState({}, '', '/?c=new');
        await handleSend(prompt);
      }
    } catch (e) {
      console.error('Secondary init error:', e);
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
    if (messages.length === 0) {
      isLoadingTranscript = true;
    }

    // Keep URL in sync with active conversation in this browser tab
    window.history.replaceState({}, '', `/?c=${id}`);

    try {
      const res = await fetchTranscript(id, settings.apiKey);
      const steps = res.steps || [];
      const parsedMessages: Message[] = [];

      for (const step of steps) {
        if (step.type === 'USER_INPUT' && step.content) {
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
    } finally {
      isLoadingTranscript = false;
    }
  }

  function handleSelectModel(modelId: string) {
    let newEffort = settings.effort;
    if (modelId.endsWith('-low')) newEffort = 'low';
    else if (modelId.endsWith('-medium')) newEffort = 'medium';
    else if (modelId.endsWith('-high')) newEffort = 'high';
    else if (modelId.endsWith('-xhigh')) newEffort = 'xhigh';
    else if (modelId.endsWith('-max')) newEffort = 'max';

    settings = {
      ...settings,
      selectedModel: modelId,
      effort: newEffort,
    };
    saveStoredSettings(settings);
  }

  async function handleDeleteConversation(id: string) {
    const conv = conversations.find((c) => c.conversation_id === id);
    const title = conv?.title || conv?.preview || 'cette discussion';
    if (!confirm(`Supprimer définitivement "${title}" ?`)) return;

    try {
      await deleteConversation(id, settings.apiKey);
      conversations = conversations.filter((c) => c.conversation_id !== id);
      if (currentConversationId === id) {
        messages = [];
        currentConversationId = null;
        if (isChatMode) {
          window.location.href = '/';
        } else {
          window.history.replaceState({}, '', '/');
          isChatMode = false;
        }
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la suppression de la conversation');
    }
  }

  async function handleClearAllConversations() {
    if (conversations.length === 0) return;
    if (
      !confirm(
        'Voulez-vous vraiment supprimer définitivement TOUTES vos conversations ? Cette action est irréversible.'
      )
    ) {
      return;
    }

    try {
      await clearAllConversations(settings.apiKey);
      conversations = [];
      messages = [];
      currentConversationId = null;
      if (isChatMode) {
        window.location.href = '/';
      } else {
        window.history.replaceState({}, '', '/');
        isChatMode = false;
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la suppression de toutes les conversations');
    }
  }

  function handleSaveSettings(newSettings: AppSettings) {
    settings = { ...newSettings };
    saveStoredSettings(settings);
  }

  async function handleStartGoogleLogin() {
    if (isLoggingIn) return;
    isLoggingIn = true;
    try {
      const res = await startGoogleLogin();
      activeLoginId = res.login_id;
      terminalUrl = res.terminal_url;
      isTerminalOpen = true;

      if (loginPollingTimer) clearInterval(loginPollingTimer);
      loginPollingTimer = setInterval(async () => {
        if (!activeLoginId) return;
        try {
          const status = await pollLogin(activeLoginId);
          if (status.authenticated) {
            if (loginPollingTimer) clearInterval(loginPollingTimer);
            loginPollingTimer = null;
            activeLoginId = null;
            isTerminalOpen = false;
            isLoggingIn = false;
            await initApp();
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors du lancement de la connexion Google');
    } finally {
      isLoggingIn = false;
    }
  }

  async function handleOpenTerminal() {
    try {
      const res = await openUserTerminal();
      terminalUrl = res.terminal_url;
      isTerminalOpen = true;
    } catch (e) {
      alert((e as Error)?.message || "Impossible d'ouvrir le terminal.");
    }
  }

  async function handleLogout() {
    if (confirm(`Voulez-vous vraiment vous déconnecter de votre compte ${userEmail} ?`)) {
      await logoutSession();
      isAuthenticated = false;
      userEmail = '';
      userId = '';
      messages = [];
      conversations = [];
      currentConversationId = null;
      isChatMode = false;
      window.location.href = '/';
    }
  }

  function handleCloseTerminal() {
    isTerminalOpen = false;
    if (loginPollingTimer) {
      clearInterval(loginPollingTimer);
      loginPollingTimer = null;
    }
    activeLoginId = null;
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

    messages.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText,
    });

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
              window.history.replaceState({}, '', `/?c=${data.conversation_id}`);
              fetchConversations(settings.apiKey)
                .then((c) => (conversations = c))
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
            fetchConversations(settings.apiKey)
              .then((c) => (conversations = c))
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

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="h-screen w-screen overflow-hidden bg-[#0c0e15] text-slate-100 flex flex-col">
  {#if isCheckingAuth && !isAuthenticated}
    <!-- Minimalist neutral loading state while verifying credentials (never flashes the login screen!) -->
    <div class="h-full flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-[#0c0e15]">
      <div class="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-3"></div>
      <p class="text-xs text-slate-400">Chargement de votre session...</p>
    </div>
  {:else if !isAuthenticated}
    <!-- Unauthenticated Google Login Hero -->
    <div class="h-full flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-b from-[#0c0e15] to-[#0f111a]">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-2xl shadow-blue-500/30 mb-6">
        <Bot size={34} />
      </div>
      <h1 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">Antigravity AI Agent</h1>
      <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-md leading-relaxed">
        Connectez-vous avec votre compte Google personnel pour accéder à votre espace de travail privé, vos modèles et vos conversations.
      </p>

      <div class="mt-8 flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onclick={handleStartGoogleLogin}
          disabled={isLoggingIn}
          class="px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-xl shadow-blue-500/25 flex items-center gap-3 transition-all cursor-pointer disabled:opacity-50"
        >
          <Terminal size={18} />
          <span>{isLoggingIn ? 'Ouverture de la session...' : 'Connexion avec mon compte Google'}</span>
        </button>
      </div>

      <div class="mt-12 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 max-w-sm text-left">
        <div class="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <ShieldCheck size={16} class="text-emerald-400" />
          <span>Confidentialité & Sessions Sécurisées</span>
        </div>
        <p class="text-[11px] text-slate-400 mt-1.5 leading-normal">
          Vos conversations et fichiers sont strictement isolés dans votre compte. Aucun autre utilisateur ne peut accéder à votre session.
        </p>
      </div>
    </div>
  {:else if !isChatMode}
    <!-- PAGE PRINCIPALE (Cockpit avec Sidebar pour un accès direct et permanent à tous ses chats existants!) -->
    <div class="flex h-full w-full overflow-hidden">
      <!-- Desktop Sidebar on Main Page -->
      <div class="hidden md:flex h-full shrink-0">
        <Sidebar
          {conversations}
          currentConversationId={null}
          {models}
          selectedModel={settings.selectedModel}
          {isConnected}
          {isAuthenticated}
          {userEmail}
          onSelectConversation={(id) => {
            window.open(`/?c=${id}`, '_blank');
          }}
          onNewChat={() => {
            window.open('/?c=new', '_blank');
          }}
          onSelectModel={handleSelectModel}
          onOpenSettings={() => (isSettingsOpen = true)}
          onOpenTerminal={handleOpenTerminal}
          onOpenApiKeyModal={() => (isApiKeyModalOpen = true)}
          onDeleteConversation={handleDeleteConversation}
          onClearAllConversations={handleClearAllConversations}
          onLogout={handleLogout}
          onRefresh={initApp}
        />
      </div>

      <!-- Main Cockpit Hub -->
      <div class="flex-1 h-full overflow-y-auto min-w-0">
        <MainPage
          {conversations}
          {models}
          selectedModel={settings.selectedModel}
          {isConnected}
          {userEmail}
          onSelectModel={handleSelectModel}
          onOpenTerminal={handleOpenTerminal}
          onOpenApiKeyModal={() => (isApiKeyModalOpen = true)}
          onOpenSettings={() => (isSettingsOpen = true)}
          onDeleteConversation={handleDeleteConversation}
          onClearAllConversations={handleClearAllConversations}
          onLogout={handleLogout}
          onRefresh={initApp}
        />
      </div>
    </div>
  {:else}
    <!-- STANDALONE CHAT: SANS AUCUN BANDEAU, SEULEMENT LE CHAT -->
    <div class="flex-1 flex flex-col h-full w-full bg-[#0f111a] relative overflow-hidden">
      <!-- Minimalist Floating Top Controls (zero layout space, unobtrusive) -->
      <div class="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <a
          href="/"
          class="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/85 hover:bg-slate-800 border border-slate-800/80 text-slate-400 hover:text-slate-100 text-xs backdrop-blur-md shadow-lg transition-all"
          title="Retourner à la page principale"
        >
          <ArrowLeft size={13} />
          <span class="font-medium">Accueil</span>
        </a>

        <div class="pointer-events-auto flex items-center gap-2">
          {#if currentConversationId}
            <button
              type="button"
              onclick={() => currentConversationId && handleDeleteConversation(currentConversationId)}
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/85 hover:bg-red-950/60 border border-slate-800/80 hover:border-red-800/40 text-slate-400 hover:text-red-300 text-xs backdrop-blur-md shadow-sm transition-all cursor-pointer"
              title="Supprimer cette discussion"
            >
              <Trash2 size={13} />
            </button>
          {/if}
          <div class="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-[11px] text-slate-300 backdrop-blur-md shadow-sm transition-all">
            <Cpu size={12} class="text-indigo-400 shrink-0" />
            <select
              value={settings.selectedModel}
              onchange={(e) => handleSelectModel((e.target as HTMLSelectElement).value)}
              class="bg-transparent text-slate-200 outline-none cursor-pointer pr-1 text-[11px] font-medium"
              title="Changer de modèle ou niveau de réflexion"
            >
              {#each models as model}
                <option value={model.id} class="bg-[#141722] text-slate-200">{model.name}</option>
              {/each}
              {#if models.length === 0}
                <option value="gemini-3.8-flash-high" class="bg-[#141722] text-slate-200">Gemini 3.8 Flash (High)</option>
                <option value="gemini-3.8-flash-medium" class="bg-[#141722] text-slate-200">Gemini 3.8 Flash (Medium)</option>
                <option value="gemini-3.8-flash-low" class="bg-[#141722] text-slate-200">Gemini 3.8 Flash (Low)</option>
              {/if}
            </select>
          </div>
          <a
            href="/?c=new"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/30 text-blue-300 hover:text-blue-100 text-xs font-medium backdrop-blur-md shadow-sm transition-all"
            title="Ouvrir un nouveau chat dans un autre onglet"
          >
            <Plus size={13} />
            <span class="hidden sm:inline">Nouveau chat</span>
          </a>
        </div>
      </div>

      <!-- Message Scroll Area -->
      <div
        bind:this={chatContainerEl}
        class="flex-1 overflow-y-auto px-2 sm:px-4 pt-14 pb-4 scroll-smooth"
      >
        {#if isLoadingTranscript}
          <div class="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 select-none">
            <div class="w-7 h-7 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-3"></div>
            <span class="text-xs font-medium text-slate-300">Chargement de la discussion...</span>
          </div>
        {:else if messages.length === 0}
          <div class="h-full flex flex-col items-center justify-center text-center px-4 max-w-lg mx-auto select-none">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/20 mb-4">
              <Bot size={28} />
            </div>
            <h2 class="text-xl font-bold text-slate-100 tracking-tight">Nouvelle discussion</h2>
            <p class="text-xs text-slate-400 mt-2 leading-relaxed">
              Votre espace privé est prêt. Posez votre question ou décrivez votre tâche.
            </p>

            <div class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141722] border border-slate-700/80 text-xs">
              <Cpu size={13} class="text-indigo-400 shrink-0" />
              <span class="text-slate-400">Modèle :</span>
              <select
                value={settings.selectedModel}
                onchange={(e) => handleSelectModel((e.target as HTMLSelectElement).value)}
                class="bg-transparent text-indigo-300 hover:text-indigo-200 font-semibold outline-none cursor-pointer"
                title="Changer de modèle"
              >
                {#each models as model}
                  <option value={model.id} class="bg-[#141722] text-slate-200 font-normal">{model.name}</option>
                {/each}
              </select>
            </div>

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

      <!-- Input Bar (pinned at bottom) -->
      <InputBar
        {isStreaming}
        disabled={!isConnected}
        dangerMode={settings.dangerouslySkipPermissions}
        {models}
        selectedModel={settings.selectedModel}
        modelName={currentModelName}
        onSelectModel={handleSelectModel}
        onSend={handleSend}
        onStop={handleStop}
      />
    </div>
  {/if}

  <!-- Settings Modal -->
  <SettingsModal
    isOpen={isSettingsOpen}
    {settings}
    {models}
    onClose={() => (isSettingsOpen = false)}
    onSave={handleSaveSettings}
  />

  <!-- Interactive Web Terminal Modal (Google OAuth / Shell) -->
  {#if isTerminalOpen}
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div class="bg-[#10131d] border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-[#0a0c13]">
          <div class="flex items-center gap-2">
            <Terminal size={16} class="text-blue-400" />
            <span class="text-xs font-semibold text-slate-200">
              {activeLoginId ? 'Connexion Google OAuth Antigravity' : 'Terminal Web Personnel'}
            </span>
          </div>
          <div class="flex items-center gap-2">
            {#if activeLoginId}
              <button
                type="button"
                onclick={async () => {
                  if (activeLoginId) {
                    const status = await pollLogin(activeLoginId);
                    if (status.authenticated) {
                      isTerminalOpen = false;
                      await initApp();
                    } else {
                      alert("Connexion non détectée. Veuillez terminer l'authentification dans le terminal.");
                    }
                  }
                }}
                class="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all cursor-pointer"
              >
                Valider ma connexion
              </button>
            {/if}
            <button
              type="button"
              onclick={handleCloseTerminal}
              class="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <iframe
          src={terminalUrl}
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
    onClose={() => (isApiKeyModalOpen = false)}
    onKeyUpdated={(newKey) => {
      if (keyInfo) keyInfo.api_key = newKey;
      settings.apiKey = newKey;
      saveStoredSettings(settings);
    }}
  />
</div>
