import React, { useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';
import { useTerminal } from './hooks/useTerminal';
import { useChat } from './hooks/useChat';

import { Sidebar } from './components/Sidebar';
import { MainPage } from './components/MainPage';
import { ChatView } from './components/ChatView';
import { AuthModal } from './components/AuthModal';
import { TerminalModal } from './components/TerminalModal';
import { SettingsModal } from './components/SettingsModal';
import { ApiKeyModal } from './components/ApiKeyModal';

export const App: React.FC = () => {
  const {
    settings,
    models,
    keyInfo,
    isSettingsOpen,
    isApiKeyModalOpen,
    updateSettings,
    setApiKey,
    selectModel,
    loadModels,
    loadUserKey,
    openSettings,
    closeSettings,
    openApiKeyModal,
    closeApiKeyModal,
  } = useSettings();

  const {
    isAuthenticated,
    isCheckingAuth,
    userEmail,
    isConnected,
    initAuth,
    logout,
  } = useAuth(() => setApiKey(''));

  const {
    isOpen: isTerminalOpen,
    isMaximized: isTerminalMaximized,
    terminalUrl,
    activeLoginId,
    isLoggingIn,
    openUserTerminal,
    startGoogleLogin,
    validateLoginManually,
    closeTerminal,
    toggleMaximized,
  } = useTerminal();

  const {
    conversations,
    currentConversationId,
    messages,
    isStreaming,
    isLoadingTranscript,
    isChatMode,
    initialPromptToSend,
    setInitialPromptToSend,
    activeTitle,
    pageTitle,
    initFromUrl,
    loadConversations,
    sendMessage,
    stopGeneration,
    deleteConversation,
    clearAllConversations,
    returnToMainTab,
    reset: resetChat,
  } = useChat(settings);

  // Initialize App on mount
  useEffect(() => {
    initFromUrl();

    initAuth(async () => {
      const promises: Promise<unknown>[] = [
        loadUserKey(),
        loadModels(),
      ];
      if (!window.location.search.includes('?c=')) {
        promises.push(loadConversations());
      }
      await Promise.allSettled(promises);
    });
  }, [initFromUrl, initAuth, loadUserKey, loadModels, loadConversations]);

  // Handle queued prompt on new chat tab (?c=new&q=...)
  useEffect(() => {
    if (isAuthenticated && isChatMode && initialPromptToSend) {
      const prompt = initialPromptToSend;
      setInitialPromptToSend(null);
      window.history.replaceState({}, '', '/?c=new');
      sendMessage(prompt);
    }
  }, [isAuthenticated, isChatMode, initialPromptToSend, setInitialPromptToSend, sendMessage]);

  // Update document title dynamically
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#06070b] text-zinc-100 flex flex-col font-sans select-none">
      {isCheckingAuth && !isAuthenticated ? (
        <div className="h-full flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-[#06070b]">
          <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin mb-3" />
          <p className="text-xs text-zinc-400">Chargement de votre session...</p>
        </div>
      ) : !isAuthenticated ? (
        <AuthModal
          isLoggingIn={isLoggingIn}
          onStartLogin={() => startGoogleLogin(() => initAuth())}
        />
      ) : !isChatMode ? (
        <div className="flex h-full w-full overflow-hidden">
          <div className="hidden md:flex h-full shrink-0">
            <Sidebar
              conversations={conversations}
              currentConversationId={null}
              models={models}
              selectedModel={settings.selectedModel}
              isConnected={isConnected}
              isAuthenticated={isAuthenticated}
              userEmail={userEmail}
              onSelectConversation={(id) => window.open(`/?c=${id}`, '_blank')}
              onNewChat={() => window.open('/?c=new', '_blank')}
              onSelectModel={selectModel}
              onOpenSettings={openSettings}
              onOpenTerminal={openUserTerminal}
              onOpenApiKeyModal={openApiKeyModal}
              onDeleteConversation={deleteConversation}
              onClearAllConversations={clearAllConversations}
              onLogout={() => logout(resetChat)}
              onRefresh={() => initAuth()}
            />
          </div>

          <div className="flex-1 h-full overflow-y-auto min-w-0">
            <MainPage
              conversations={conversations}
              models={models}
              selectedModel={settings.selectedModel}
              isConnected={isConnected}
              isAuthenticated={isAuthenticated}
              userEmail={userEmail}
              onSelectConversation={(id) => window.open(`/?c=${id}`, '_blank')}
              onNewChat={() => window.open('/?c=new', '_blank')}
              onSelectModel={selectModel}
              onOpenTerminal={openUserTerminal}
              onOpenApiKeyModal={openApiKeyModal}
              onOpenSettings={openSettings}
              onDeleteConversation={deleteConversation}
              onClearAllConversations={clearAllConversations}
              onLogout={() => logout(resetChat)}
              onRefresh={() => initAuth()}
            />
          </div>
        </div>
      ) : (
        <ChatView
          currentConversationId={currentConversationId}
          messages={messages}
          isStreaming={isStreaming}
          isLoadingTranscript={isLoadingTranscript}
          activeTitle={activeTitle}
          settings={settings}
          models={models}
          isConnected={isConnected}
          onSelectModel={selectModel}
          onSendMessage={sendMessage}
          onStopGeneration={stopGeneration}
          onDeleteConversation={deleteConversation}
          onReturnToMainTab={returnToMainTab}
          onOpenTerminal={openUserTerminal}
        />
      )}

      {/* Terminal Modal */}
      <TerminalModal
        isOpen={isTerminalOpen}
        isMaximized={isTerminalMaximized}
        terminalUrl={terminalUrl}
        activeLoginId={activeLoginId}
        onClose={closeTerminal}
        onToggleMaximize={toggleMaximized}
        onValidateLogin={() => validateLoginManually(() => initAuth())}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        models={models}
        onClose={closeSettings}
        onSave={updateSettings}
      />

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        keyInfo={keyInfo}
        onClose={closeApiKeyModal}
        onKeyUpdated={setApiKey}
      />
    </div>
  );
};

export default App;
