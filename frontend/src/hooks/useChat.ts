import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { Conversation, Message, AppSettings } from '../lib/types';
import {
  fetchConversations,
  fetchTranscript,
  deleteConversation as apiDeleteConversation,
  clearAllConversations as apiClearAllConversations,
  streamChat,
} from '../lib/api';
import { tabSync } from '../lib/tabSync';

export function useChat(settings: AppSettings) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [initialPromptToSend, setInitialPromptToSend] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const activeConv = useMemo(() => {
    return conversations.find((c) => c.conversation_id === currentConversationId);
  }, [conversations, currentConversationId]);

  const activeTitle = useMemo(() => {
    return (
      activeConv?.title ||
      activeConv?.preview ||
      (messages.length > 0 && messages[0].role === 'user' ? messages[0].content : 'Nouvelle Session')
    );
  }, [activeConv, messages]);

  const currentConversationTitle = useMemo(() => {
    return (
      activeConv?.title ||
      (messages.length > 0 && messages[0].role === 'user' ? messages[0].content.slice(0, 30) : '')
    );
  }, [activeConv, messages]);

  const pageTitle = useMemo(() => {
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
  }, [isChatMode, currentConversationTitle, messages]);

  const returnToMainTab = useCallback(() => {
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
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchConversations(settings.apiKey);
      setConversations(data);
    } catch (e) {
      console.warn('Failed to fetch conversations', e);
    }
  }, [settings.apiKey]);

  const selectConversation = useCallback(async (id: string) => {
    if (isStreaming) return;
    setCurrentConversationId(id);
    setIsLoadingTranscript(true);

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

      setMessages(parsedMessages);
    } catch (e) {
      console.error('Failed to load conversation transcript:', e);
    } finally {
      setIsLoadingTranscript(false);
    }
  }, [isStreaming, settings.apiKey]);

  const initFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const cParam = params.get('c');
    const qParam = params.get('q');

    if (cParam !== null) {
      setIsChatMode(true);
      if (cParam !== 'new' && cParam.trim()) {
        const convId = cParam.trim();
        selectConversation(convId);
      }
      if (qParam && qParam.trim()) {
        setInitialPromptToSend(qParam.trim());
      }
    } else {
      setIsChatMode(false);
    }
  }, [selectConversation]);

  const sendMessage = useCallback(async (promptText: string, onScrollToBottom?: () => void) => {
    if (!promptText.trim() || isStreaming) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText,
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      toolCalls: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    onScrollToBottom?.();

    const controller = new AbortController();
    abortControllerRef.current = controller;

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
              setCurrentConversationId(data.conversation_id);
              window.history.replaceState({}, '', `/?c=${data.conversation_id}`);
              tabSync.broadcast({ type: 'REFRESH_CONVERSATIONS' });
              loadConversations();
            }
          },
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId ? { ...msg, content: msg.content + delta } : msg
              )
            );
            onScrollToBottom?.();
          },
          onThought: (thoughtDelta) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, thought: (msg.thought || '') + thoughtDelta }
                  : msg
              )
            );
          },
          onToolCall: (toolCall) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, toolCalls: [...(msg.toolCalls || []), toolCall] }
                  : msg
              )
            );
          },
          onResult: (result) => {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMsgId) return msg;
                return {
                  ...msg,
                  content: result.response && !msg.content ? result.response : msg.content,
                  usage: result.usage || msg.usage,
                };
              })
            );
          },
          onError: (errMsg) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, content: msg.content + `\n\n> ⚠️ **Error:** ${errMsg}` }
                  : msg
              )
            );
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg))
            );
            setIsStreaming(false);
            abortControllerRef.current = null;
            loadConversations();
          },
        },
        controller.signal
      );
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: msg.content + `\n\n> ⚠️ **Request Failed:** ${(e as Error)?.message}`,
                  isStreaming: false,
                }
              : msg
          )
        );
      }
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, currentConversationId, settings, loadConversations]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((msg, i) => (i === prev.length - 1 ? { ...msg, isStreaming: false } : msg))
    );
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    const conv = conversations.find((c) => c.conversation_id === id);
    const title = conv?.title || conv?.preview || 'cette discussion';
    if (!confirm(`Supprimer définitivement "${title}" ?`)) return;

    try {
      await apiDeleteConversation(id, settings.apiKey);
      setConversations((prev) => prev.filter((c) => c.conversation_id !== id));
      tabSync.broadcast({ type: 'CONVERSATION_DELETED', id });

      if (currentConversationId === id) {
        setMessages([]);
        setCurrentConversationId(null);
        if (isChatMode) {
          returnToMainTab();
        } else {
          window.history.replaceState({}, '', '/');
          setIsChatMode(false);
        }
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la suppression de la conversation');
    }
  }, [conversations, currentConversationId, isChatMode, returnToMainTab, settings.apiKey]);

  const clearAllConversations = useCallback(async () => {
    if (conversations.length === 0) return;
    if (
      !confirm(
        'Voulez-vous vraiment supprimer définitivement TOUTES vos conversations ? Cette action est irréversible.'
      )
    ) {
      return;
    }

    try {
      await apiClearAllConversations(settings.apiKey);
      setConversations([]);
      setMessages([]);
      setCurrentConversationId(null);
      tabSync.broadcast({ type: 'CONVERSATIONS_CLEARED' });

      if (isChatMode) {
        returnToMainTab();
      } else {
        window.history.replaceState({}, '', '/');
        setIsChatMode(false);
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la suppression de toutes les conversations');
    }
  }, [conversations.length, isChatMode, returnToMainTab, settings.apiKey]);

  const reset = useCallback(() => {
    setMessages([]);
    setConversations([]);
    setCurrentConversationId(null);
    setIsChatMode(false);
  }, []);

  useEffect(() => {
    const unsubscribe = tabSync.subscribe((event) => {
      if (event.type === 'CONVERSATION_DELETED') {
        const deletedId = event.id;
        setConversations((prev) => prev.filter((c) => c.conversation_id !== deletedId));
        if (currentConversationId === deletedId) {
          returnToMainTab();
        }
      } else if (event.type === 'CONVERSATIONS_CLEARED') {
        setConversations([]);
        if (isChatMode) {
          returnToMainTab();
        }
      } else if (event.type === 'REFRESH_CONVERSATIONS') {
        loadConversations();
      }
    });
    return unsubscribe;
  }, [currentConversationId, isChatMode, loadConversations, returnToMainTab]);

  return {
    conversations,
    currentConversationId,
    messages,
    setMessages,
    isStreaming,
    isLoadingTranscript,
    isChatMode,
    initialPromptToSend,
    setInitialPromptToSend,
    activeConv,
    activeTitle,
    currentConversationTitle,
    pageTitle,
    initFromUrl,
    loadConversations,
    selectConversation,
    sendMessage,
    stopGeneration,
    deleteConversation,
    clearAllConversations,
    returnToMainTab,
    reset,
  };
}
