<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import MainPage from './lib/MainPage.svelte';
  import ChatView from './lib/ChatView.svelte';
  import AuthModal from './lib/AuthModal.svelte';
  import TerminalModal from './lib/TerminalModal.svelte';
  import SettingsModal from './lib/SettingsModal.svelte';
  import ApiKeyModal from './lib/ApiKeyModal.svelte';

  import { authState } from './lib/state/authState.svelte';
  import { chatState } from './lib/state/chatState.svelte';
  import { settingsState } from './lib/state/settingsState.svelte';
  import { terminalState } from './lib/state/terminalState.svelte';
  import { tabSync } from './lib/state/tabSync';

  async function initApp() {
    await authState.initAuth(async () => {
      // Secondary metadata in parallel once authenticated
      const promises: Promise<unknown>[] = [
        settingsState.loadUserKey(),
        settingsState.loadModels(),
      ];

      if (!chatState.isChatMode) {
        promises.push(chatState.loadConversations());
      }

      await Promise.allSettled(promises);

      // If a prompt was queued for new chat (?c=new&q=...)
      if (chatState.isChatMode && chatState.initialPromptToSend) {
        const prompt = chatState.initialPromptToSend;
        chatState.initialPromptToSend = null;
        window.history.replaceState({}, '', '/?c=new');
        await chatState.sendMessage(prompt);
      }
    });
  }

  onMount(() => {
    chatState.initFromUrl();
    initApp();
  });

  onDestroy(() => {
    tabSync.close();
  });
</script>

<svelte:head>
  <title>{chatState.pageTitle}</title>
</svelte:head>

<div class="h-screen w-screen overflow-hidden bg-[#06070b] text-zinc-100 flex flex-col font-sans select-none">
  {#if authState.isCheckingAuth && !authState.isAuthenticated}
    <!-- Minimalist neutral loading state while verifying credentials -->
    <div class="h-full flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-[#06070b]">
      <div class="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin mb-3"></div>
      <p class="text-xs text-zinc-400">Chargement de votre session...</p>
    </div>
  {:else if !authState.isAuthenticated}
    <AuthModal
      isLoggingIn={terminalState.isLoggingIn}
      onStartLogin={() => terminalState.startGoogleLogin(initApp)}
    />
  {:else if !chatState.isChatMode}
    <!-- PAGE PRINCIPALE (Cockpit avec Sidebar pour un accès direct et permanent à tous ses chats existants!) -->
    <div class="flex h-full w-full overflow-hidden">
      <!-- Desktop Sidebar on Main Page -->
      <div class="hidden md:flex h-full shrink-0">
        <Sidebar
          conversations={chatState.conversations}
          currentConversationId={null}
          models={settingsState.models}
          selectedModel={settingsState.settings.selectedModel}
          isConnected={authState.isConnected}
          isAuthenticated={authState.isAuthenticated}
          userEmail={authState.userEmail}
          onSelectConversation={(id) => window.open(`/?c=${id}`, '_blank')}
          onNewChat={() => window.open('/?c=new', '_blank')}
          onSelectModel={(id) => settingsState.selectModel(id)}
          onOpenSettings={() => settingsState.openSettings()}
          onOpenTerminal={() => terminalState.openUserTerminal()}
          onOpenApiKeyModal={() => settingsState.openApiKeyModal()}
          onDeleteConversation={(id) => chatState.deleteConversation(id)}
          onClearAllConversations={() => chatState.clearAllConversations()}
          onLogout={() => authState.logout(() => chatState.reset())}
          onRefresh={initApp}
        />
      </div>

      <!-- Main Cockpit Hub -->
      <div class="flex-1 h-full overflow-y-auto min-w-0">
        <MainPage
          conversations={chatState.conversations}
          models={settingsState.models}
          selectedModel={settingsState.settings.selectedModel}
          isConnected={authState.isConnected}
          isAuthenticated={authState.isAuthenticated}
          userEmail={authState.userEmail}
          onSelectConversation={(id) => window.open(`/?c=${id}`, '_blank')}
          onNewChat={() => window.open('/?c=new', '_blank')}
          onSelectModel={(id) => settingsState.selectModel(id)}
          onOpenTerminal={() => terminalState.openUserTerminal()}
          onOpenApiKeyModal={() => settingsState.openApiKeyModal()}
          onOpenSettings={() => settingsState.openSettings()}
          onDeleteConversation={(id) => chatState.deleteConversation(id)}
          onClearAllConversations={() => chatState.clearAllConversations()}
          onLogout={() => authState.logout(() => chatState.reset())}
          onRefresh={initApp}
        />
      </div>
    </div>
  {:else}
    <!-- STANDALONE DEDICATED CHAT VIEW -->
    <ChatView />
  {/if}

  <!-- Interactive Web Terminal Modal -->
  <TerminalModal onLoginSuccess={initApp} />

  <!-- Settings Modal -->
  <SettingsModal
    isOpen={settingsState.isSettingsOpen}
    settings={settingsState.settings}
    models={settingsState.models}
    onClose={() => settingsState.closeSettings()}
    onSave={(newSettings) => settingsState.updateSettings(newSettings)}
  />

  <!-- API Key & Developer Code Modal -->
  <ApiKeyModal
    isOpen={settingsState.isApiKeyModalOpen}
    keyInfo={settingsState.keyInfo}
    onClose={() => settingsState.closeApiKeyModal()}
    onKeyUpdated={(newKey) => settingsState.setApiKey(newKey)}
  />
</div>
