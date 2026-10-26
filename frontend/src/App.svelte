<script lang="ts">
  import { onMount, tick, onDestroy } from 'svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import MainPage from './lib/MainPage.svelte';
  import MessageItem from './lib/Message.svelte';
  import InputBar from './lib/InputBar.svelte';
  import SettingsModal from './lib/SettingsModal.svelte';
  import ApiKeyModal from './lib/ApiKeyModal.svelte';
  import AuthModal from './lib/AuthModal.svelte';
  import {
    checkHealth,
    fetchMe,
    startGoogleLogin,
    pollLogin,
    openUserTerminal,
    logoutSession,
    clearSession,
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
    Sparkles,
    Compass,
    Zap,
    Code2,
    Maximize2,
    Minimize2,
  } from 'lucide-svelte';

  function checkHasStoredAuth(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const sess = localStorage.getItem('antigravity_session_token');
      if (sess && sess.trim()) return true;
      if (document.cookie && document.cookie.includes('antigravity_session=')) {
        const match = document.cookie.match(/(?:^|;\s*)antigravity_session=([^;]+)/);
        if (match && match[1] && match[1].trim()) return true;
      }
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
  let isTerminalMaximized = $state(false);
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

  let activeConv = $derived(conversations.find((c) => c.conversation_id === currentConversationId));
  let activeTitle = $derived(
    activeConv?.title || activeConv?.preview || (messages.length > 0 && messages[0].role === 'user' ? messages[0].content : 'Nouvelle Session')
  );

  let currentConversationTitle = $derived(
    activeConv?.title ||
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

    // Inter-tab synchronization via BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        syncChannel = new BroadcastChannel('antigravity_tab_sync');
        syncChannel.onmessage = (event) => {
          if (event.data?.type === 'CONVERSATION_DELETED') {
            const deletedId = event.data.id;
            conversations = conversations.filter((c) => c.conversation_id !== deletedId);
            if (currentConversationId === deletedId) {
              returnToMainTab();
            }
          } else if (event.data?.type === 'CONVERSATIONS_CLEARED') {
            conversations = [];
            if (isChatMode) {
              returnToMainTab();
            }
          } else if (event.data?.type === 'REFRESH_CONVERSATIONS') {
            fetchConversations(settings.apiKey)
              .then((c) => (conversations = c))
              .catch(() => {});
          } else if (event.data?.type === 'USER_LOGGED_OUT') {
            isAuthenticated = false;
            userEmail = '';
            userId = '';
            messages = [];
            conversations = [];
            currentConversationId = null;
            isChatMode = false;
            settings.apiKey = '';
            clearSession();
          }
        };
      } catch {}
    }

    // Authenticate & load secondary metadata in parallel
    initApp();
  });

  onDestroy(() => {
    try {
      syncChannel?.close();
    } catch {}
  });

  let syncChannel: BroadcastChannel | null = null;

  function broadcastSync(data: Record<string, unknown>) {
    try {
      syncChannel?.postMessage(data);
    } catch {}
  }

  function returnToMainTab() {
    let hasOpener = false;
    try {
      if (window.opener && !window.opener.closed) {
        hasOpener = true;
        window.opener.focus();
      }
    } catch {}

    // Close this chat tab so the user returns to the main cockpit tab
    window.close();

    // Fallback if window.close() is blocked by browser security
    setTimeout(() => {
      if (!window.closed && !hasOpener) {
        window.location.href = '/';
      }
    }, 200);
  }

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
        clearSession();
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
      broadcastSync({ type: 'CONVERSATION_DELETED', id });

      if (currentConversationId === id) {
        messages = [];
        currentConversationId = null;
        if (isChatMode) {
          returnToMainTab();
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
      broadcastSync({ type: 'CONVERSATIONS_CLEARED' });

      if (isChatMode) {
        returnToMainTab();
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
      settings.apiKey = '';
      broadcastSync({ type: 'USER_LOGGED_OUT' });
      window.history.replaceState({}, '', '/');
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
              broadcastSync({ type: 'REFRESH_CONVERSATIONS' });
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

<div class="h-screen w-screen overflow-hidden bg-[#06070b] text-zinc-100 flex flex-col font-sans select-none">
  {#if isCheckingAuth && !isAuthenticated}
    <!-- Minimalist neutral loading state while verifying credentials -->
    <div class="h-full flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-[#06070b]">
      <div class="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin mb-3"></div>
      <p class="text-xs text-zinc-400">Chargement de votre session...</p>
    </div>
  {:else if !isAuthenticated}
    <AuthModal {isLoggingIn} onStartLogin={handleStartGoogleLogin} />
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
    <!-- STANDALONE DEDICATED CHAT VIEW -->
    <div class="flex-1 flex flex-col h-full w-full bg-[#06070b] bg-cosmic-grid relative overflow-hidden select-text font-sans">
      <div class="pointer-events-none fixed top-[-220px] left-1/2 -translate-x-1/2 w-[650px] h-[340px] bg-violet-600/10 rounded-full blur-[140px]"></div>

      <!-- Floating Glass Header -->
      <header class="sticky top-0 z-20 px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#06070b]/80 backdrop-blur-xl select-none">
        <div class="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onclick={returnToMainTab}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer shrink-0"
            title="Retourner au Cockpit"
          >
            <ArrowLeft size={13} />
            <span>Cockpit</span>
          </button>

          <div class="h-4 w-[1px] bg-white/[0.08] hidden sm:block"></div>

          <div class="truncate text-xs font-semibold text-zinc-200 hidden sm:block max-w-md">
            {activeTitle}
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          {#if currentConversationId}
            <button
              type="button"
              onclick={() => currentConversationId && handleDeleteConversation(currentConversationId)}
              class="p-2 rounded-xl bg-white/[0.03] hover:bg-rose-500/15 border border-white/[0.07] hover:border-rose-500/30 text-zinc-400 hover:text-rose-300 text-xs transition-all cursor-pointer"
              title="Supprimer cette session"
            >
              <Trash2 size={13} />
            </button>
          {/if}

          <button
            type="button"
            onclick={handleOpenTerminal}
            class="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] text-cyan-400 text-xs transition-all cursor-pointer"
            title="Ouvrir le terminal"
          >
            <Terminal size={13} />
          </button>

          <div class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-xs transition-colors">
            <Cpu size={12} class="text-violet-400 shrink-0" />
            <select
              value={settings.selectedModel}
              onchange={(e) => handleSelectModel((e.target as HTMLSelectElement).value)}
              class="bg-transparent text-xs font-semibold text-zinc-200 outline-none cursor-pointer pr-1"
              title="Changer de modèle ou niveau de réflexion"
            >
              {#each models as model}
                <option value={model.id} class="bg-[#0c0e16] text-zinc-200">{model.name}</option>
              {/each}
              {#if models.length === 0}
                <option value="gemini-3.8-flash-high" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (High)</option>
                <option value="gemini-3.8-flash-medium" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (Medium)</option>
                <option value="gemini-3.8-flash-low" class="bg-[#0c0e16] text-zinc-200">Gemini 3.8 Flash (Low)</option>
              {/if}
            </select>
          </div>

          <a
            href="/?c=new"
            target="_blank"
            onclick={(e) => {
              e.preventDefault();
              window.open('/?c=new', '_blank');
            }}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 text-xs font-semibold transition-all cursor-pointer"
            title="Ouvrir un nouveau chat dans un autre onglet"
          >
            <Plus size={13} />
            <span class="hidden sm:inline">Nouvelle Session</span>
          </a>
        </div>
      </header>

      <!-- Message Scroll Area -->
      <div
        bind:this={chatContainerEl}
        class="flex-1 overflow-y-auto px-2 sm:px-4 pt-4 pb-6 scroll-smooth relative z-10"
      >
        {#if isLoadingTranscript}
          <div class="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400 select-none">
            <div class="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin mb-3"></div>
            <span class="text-xs font-medium text-zinc-300">Chargement de la discussion...</span>
          </div>
        {:else if messages.length === 0}
          <div class="h-full flex flex-col items-center justify-center text-center px-4 max-w-xl mx-auto select-none my-auto py-12">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-violet-600/25 mb-4 border border-white/20">
              <Sparkles size={26} />
            </div>
            <h3 class="text-xl font-extrabold text-white tracking-tight">
              Session Autonome Prête
            </h3>
            <p class="text-xs sm:text-sm text-zinc-400 mt-2 max-w-md leading-relaxed">
              Posez une question, lancez un script shell ou ordonnez une modification de code. L'agent Antigravity exécutera vos outils en toute fluidité.
            </p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-8 w-full text-left">
              <button
                type="button"
                onclick={() => handleSend("Explique-moi l’architecture du projet et les technologies utilisées.")}
                class="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-violet-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
              >
                <Compass size={15} class="text-violet-400 shrink-0" />
                <span>Expliquer l'architecture du projet</span>
              </button>

              <button
                type="button"
                onclick={() => handleSend("Quels outils et MCP sont configurés sur ce nœud ?")}
                class="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-cyan-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
              >
                <Zap size={15} class="text-cyan-400 shrink-0" />
                <span>Lister les outils & MCP disponibles</span>
              </button>

              <button
                type="button"
                onclick={() => handleSend("Effectue un audit de sécurité et de propreté du code.")}
                class="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-emerald-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
              >
                <Code2 size={15} class="text-emerald-400 shrink-0" />
                <span>Auditer la qualité du code</span>
              </button>

              <button
                type="button"
                onclick={handleOpenTerminal}
                class="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] hover:border-amber-500/30 text-xs text-zinc-300 transition-all cursor-pointer flex items-center gap-2.5"
              >
                <Terminal size={15} class="text-amber-400 shrink-0" />
                <span>Ouvrir la console shell bash</span>
              </button>
            </div>
          </div>
        {:else}
          <div class="space-y-1">
            {#each messages as msg (msg.id)}
              <MessageItem message={msg} />
            {/each}
          </div>
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
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 font-mono">
      <div
        class="bg-[#050609] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 {isTerminalMaximized ? 'w-full h-full' : 'w-full max-w-4xl h-[85vh]'}"
      >
        <!-- Terminal Header -->
        <div class="bg-[#0b0e17] px-4 py-3 border-b border-white/[0.08] flex items-center justify-between select-none">
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1.5 mr-2">
              <button
                type="button"
                onclick={handleCloseTerminal}
                class="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-500 inline-block cursor-pointer"
                title="Fermer"
              ></button>
              <button
                type="button"
                onclick={() => (isTerminalMaximized = !isTerminalMaximized)}
                class="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 inline-block cursor-pointer"
                title="Agrandir"
              ></button>
              <span class="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
            </div>

            <div class="flex items-center gap-2 text-xs text-zinc-300">
              <Terminal size={14} class="text-cyan-400" />
              <span class="font-semibold text-zinc-200">
                {activeLoginId ? 'oauth — Connexion Google Antigravity' : 'bash — antigravity-worker-01'}
              </span>
            </div>
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
                class="px-3 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                Valider ma connexion
              </button>
            {/if}
            <button
              type="button"
              onclick={() => (isTerminalMaximized = !isTerminalMaximized)}
              class="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
            >
              {#if isTerminalMaximized}
                <Minimize2 size={14} />
              {:else}
                <Maximize2 size={14} />
              {/if}
            </button>
            <button
              type="button"
              onclick={handleCloseTerminal}
              class="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
            >
              <X size={15} />
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
