import type { Conversation, Message } from '../types';
import {
  fetchConversations,
  fetchTranscript,
  deleteConversation,
  clearAllConversations,
  streamChat,
} from '../api';
import { settingsState } from './settingsState.svelte';
import { tabSync } from './tabSync';

class ChatState {
  conversations = $state<Conversation[]>([]);
  currentConversationId = $state<string | null>(null);
  messages = $state<Message[]>([]);
  isStreaming = $state(false);
  isLoadingTranscript = $state(false);
  isChatMode = $state(false);

  private currentAbortController: AbortController | null = null;
  public initialPromptToSend: string | null = null;

  activeConv = $derived(
    this.conversations.find((c) => c.conversation_id === this.currentConversationId)
  );

  activeTitle = $derived(
    this.activeConv?.title ||
      this.activeConv?.preview ||
      (this.messages.length > 0 && this.messages[0].role === 'user'
        ? this.messages[0].content
        : 'Nouvelle Session')
  );

  currentConversationTitle = $derived(
    this.activeConv?.title ||
      (this.messages.length > 0 && this.messages[0].role === 'user'
        ? this.messages[0].content.slice(0, 30)
        : '')
  );

  pageTitle = $derived.by(() => {
    if (!this.isChatMode) {
      return 'Antigravity - Cockpit';
    }
    if (this.currentConversationTitle) {
      return `${this.currentConversationTitle} - Antigravity`;
    }
    if (this.messages.length > 0 && this.messages[0].role === 'user') {
      return `${this.messages[0].content.slice(0, 30)} - Antigravity`;
    }
    return 'Nouveau Chat - Antigravity';
  });

  constructor() {
    tabSync.subscribe((event) => {
      if (event.type === 'CONVERSATION_DELETED') {
        const deletedId = event.id;
        this.conversations = this.conversations.filter((c) => c.conversation_id !== deletedId);
        if (this.currentConversationId === deletedId) {
          this.returnToMainTab();
        }
      } else if (event.type === 'CONVERSATIONS_CLEARED') {
        this.conversations = [];
        if (this.isChatMode) {
          this.returnToMainTab();
        }
      } else if (event.type === 'REFRESH_CONVERSATIONS') {
        this.loadConversations();
      }
    });
  }

  public initFromUrl() {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const cParam = params.get('c');
    const qParam = params.get('q');

    if (cParam !== null) {
      this.isChatMode = true;
      if (cParam !== 'new' && cParam.trim()) {
        const convId = cParam.trim();
        this.selectConversation(convId);
      }
      if (qParam && qParam.trim()) {
        this.initialPromptToSend = qParam.trim();
      }
    } else {
      this.isChatMode = false;
    }
  }

  public async loadConversations() {
    try {
      this.conversations = await fetchConversations(settingsState.settings.apiKey);
    } catch (e) {
      console.warn('Failed to fetch conversations', e);
    }
  }

  public async selectConversation(id: string) {
    if (this.isStreaming) return;
    this.currentConversationId = id;
    if (this.messages.length === 0) {
      this.isLoadingTranscript = true;
    }

    window.history.replaceState({}, '', `/?c=${id}`);

    try {
      const res = await fetchTranscript(id, settingsState.settings.apiKey);
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

      this.messages = parsedMessages;
    } catch (e) {
      console.error('Failed to load conversation transcript:', e);
    } finally {
      this.isLoadingTranscript = false;
    }
  }

  public async sendMessage(promptText: string, onScrollToBottom?: () => void) {
    if (!promptText.trim() || this.isStreaming) return;

    this.messages.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText,
    });

    const assistantMsgIndex = this.messages.length;
    this.messages.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      toolCalls: [],
    });

    this.isStreaming = true;
    onScrollToBottom?.();

    this.currentAbortController = new AbortController();

    try {
      await streamChat(
        promptText,
        {
          conversationId: this.currentConversationId || undefined,
          model: settingsState.settings.selectedModel,
          mode: settingsState.settings.mode,
          effort: settingsState.settings.effort,
          dangerouslySkipPermissions: settingsState.settings.dangerouslySkipPermissions,
          apiKey: settingsState.settings.apiKey,
        },
        {
          onInit: (data) => {
            if (data.conversation_id && !this.currentConversationId) {
              this.currentConversationId = data.conversation_id;
              window.history.replaceState({}, '', `/?c=${data.conversation_id}`);
              tabSync.broadcast({ type: 'REFRESH_CONVERSATIONS' });
              this.loadConversations();
            }
          },
          onDelta: (delta) => {
            if (this.messages[assistantMsgIndex]) {
              this.messages[assistantMsgIndex].content += delta;
              onScrollToBottom?.();
            }
          },
          onThought: (thoughtDelta) => {
            if (this.messages[assistantMsgIndex]) {
              this.messages[assistantMsgIndex].thought =
                (this.messages[assistantMsgIndex].thought || '') + thoughtDelta;
            }
          },
          onToolCall: (toolCall) => {
            if (this.messages[assistantMsgIndex]) {
              const currentTools = this.messages[assistantMsgIndex].toolCalls || [];
              this.messages[assistantMsgIndex].toolCalls = [...currentTools, toolCall];
            }
          },
          onResult: (result) => {
            if (this.messages[assistantMsgIndex]) {
              if (result.response && !this.messages[assistantMsgIndex].content) {
                this.messages[assistantMsgIndex].content = result.response;
              }
              if (result.usage) {
                this.messages[assistantMsgIndex].usage = result.usage;
              }
            }
          },
          onError: (errMsg) => {
            if (this.messages[assistantMsgIndex]) {
              this.messages[assistantMsgIndex].content += `\n\n> ⚠️ **Error:** ${errMsg}`;
            }
          },
          onDone: () => {
            if (this.messages[assistantMsgIndex]) {
              this.messages[assistantMsgIndex].isStreaming = false;
            }
            this.isStreaming = false;
            this.currentAbortController = null;
            this.loadConversations();
          },
        },
        this.currentAbortController.signal
      );
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        if (this.messages[assistantMsgIndex]) {
          this.messages[assistantMsgIndex].content += `\n\n> ⚠️ **Request Failed:** ${(e as Error)?.message}`;
          this.messages[assistantMsgIndex].isStreaming = false;
        }
      }
    } finally {
      this.isStreaming = false;
    }
  }

  public stopGeneration() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.isStreaming = false;
    if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'assistant') {
      this.messages[this.messages.length - 1].isStreaming = false;
    }
  }

  public async deleteConversation(id: string) {
    const conv = this.conversations.find((c) => c.conversation_id === id);
    const title = conv?.title || conv?.preview || 'cette discussion';
    if (!confirm(`Supprimer définitivement "${title}" ?`)) return;

    try {
      await deleteConversation(id, settingsState.settings.apiKey);
      this.conversations = this.conversations.filter((c) => c.conversation_id !== id);
      tabSync.broadcast({ type: 'CONVERSATION_DELETED', id });

      if (this.currentConversationId === id) {
        this.messages = [];
        this.currentConversationId = null;
        if (this.isChatMode) {
          this.returnToMainTab();
        } else {
          window.history.replaceState({}, '', '/');
          this.isChatMode = false;
        }
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la suppression de la conversation');
    }
  }

  public async clearAllConversations() {
    if (this.conversations.length === 0) return;
    if (
      !confirm(
        'Voulez-vous vraiment supprimer définitivement TOUTES vos conversations ? Cette action est irréversible.'
      )
    ) {
      return;
    }

    try {
      await clearAllConversations(settingsState.settings.apiKey);
      this.conversations = [];
      this.messages = [];
      this.currentConversationId = null;
      tabSync.broadcast({ type: 'CONVERSATIONS_CLEARED' });

      if (this.isChatMode) {
        this.returnToMainTab();
      } else {
        window.history.replaceState({}, '', '/');
        this.isChatMode = false;
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la suppression de toutes les conversations');
    }
  }

  public returnToMainTab() {
    let hasOpener = false;
    try {
      if (window.opener && !window.opener.closed) {
        hasOpener = true;
        window.opener.focus();
      }
    } catch {}

    window.close();

    setTimeout(() => {
      if (!window.closed && !hasOpener) {
        window.location.href = '/';
      }
    }, 200);
  }

  public reset() {
    this.messages = [];
    this.conversations = [];
    this.currentConversationId = null;
    this.isChatMode = false;
  }
}

export const chatState = new ChatState();
