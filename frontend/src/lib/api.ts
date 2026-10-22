import type { AppSettings, Conversation, Model, UsageInfo } from './types';

export function getStoredSettings(): AppSettings {
  const defaultSettings: AppSettings = {
    apiKey: '',
    selectedModel: 'gemini-3.8-flash-high',
    mode: 'auto',
    effort: 'high',
    dangerouslySkipPermissions: true,
  };

  try {
    const raw = localStorage.getItem('antigravity_settings');
    if (raw) {
      return { ...defaultSettings, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error loading settings', e);
  }
  return defaultSettings;
}

export function saveStoredSettings(settings: AppSettings) {
  try {
    localStorage.setItem('antigravity_settings', JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving settings', e);
  }
}

function getHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  const key = apiKey || getStoredSettings().apiKey;
  if (key && key.trim().length > 0) {
    headers['Authorization'] = `Bearer ${key.trim()}`;
  }
  return headers;
}

export async function checkHealth(apiKey?: string) {
  const res = await fetch('/health', {
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return res.json();
}

export async function checkAuthStatus(apiKey?: string): Promise<{ authenticated: boolean; message?: string; terminal_url?: string }> {
  try {
    const res = await fetch('/api/auth/status', {
      headers: getHeaders(apiKey),
    });
    if (!res.ok) {
      return { authenticated: false };
    }
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}

export interface UserKeyInfo {
  api_key: string;
  authenticated: boolean;
  prefix: string;
  header: string;
  curl_example: string;
  curl_stream_example: string;
  python_example: string;
}

export async function fetchUserKey(): Promise<UserKeyInfo> {
  const res = await fetch('/api/user/key');
  if (!res.ok) {
    throw new Error(`Failed to fetch user API key (${res.status})`);
  }
  return res.json();
}

export async function regenerateUserKey(apiKey?: string): Promise<{ status: string; api_key: string }> {
  const res = await fetch('/api/user/key/regenerate', {
    method: 'POST',
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Failed to regenerate API key (${res.status})`);
  }
  return res.json();
}

export async function fetchModels(apiKey?: string): Promise<Model[]> {
  const res = await fetch('/api/models', {
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.statusText}`);
  }
  const data = await res.json();
  return data.models || [];
}

export async function fetchConversations(apiKey?: string): Promise<Conversation[]> {
  const res = await fetch('/api/conversations', {
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch conversations: ${res.statusText}`);
  }
  const data = await res.json();
  return data.conversations || [];
}

export async function fetchTranscript(conversationId: string, apiKey?: string) {
  const res = await fetch(`/api/conversations/${conversationId}/transcript`, {
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch transcript: ${res.statusText}`);
  }
  return res.json();
}

export interface StreamChatCallbacks {
  onInit?: (data: { conversation_id: string; tools?: string[] }) => void;
  onDelta?: (delta: string) => void;
  onThought?: (thought: string) => void;
  onToolCall?: (toolCall: { name: string; args?: Record<string, unknown> }) => void;
  onResult?: (result: { response: string; usage?: UsageInfo }) => void;
  onError?: (err: string) => void;
  onDone?: () => void;
}

export async function streamChat(
  prompt: string,
  options: {
    conversationId?: string;
    model?: string;
    mode?: string;
    effort?: string;
    dangerouslySkipPermissions?: boolean;
    apiKey?: string;
  },
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal
) {
  const payload = {
    prompt,
    conversation_id: options.conversationId || undefined,
    model: options.model || undefined,
    mode: options.mode || undefined,
    effort: options.effort || undefined,
    dangerously_skip_permissions: options.dangerouslySkipPermissions ?? true,
    stream: true,
  };

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: getHeaders(options.apiKey),
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      errorDetail = errJson.message || errJson.error || response.statusText;
    } catch {
      // ignore
    }
    throw new Error(`Server error (${response.status}): ${errorDetail}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body has no reader');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (currentEvent === 'init' || parsed.event === 'init') {
              const initData = parsed.init || parsed;
              callbacks.onInit?.({
                conversation_id: parsed.conversation_id || initData.conversation_id,
                tools: initData.tools,
              });
            } else if (currentEvent === 'step_update' || parsed.event === 'step_update') {
              const update = parsed.step_update || parsed;
              if (update.text_delta) {
                callbacks.onDelta?.(update.text_delta);
              }
              if (update.thought_delta) {
                callbacks.onThought?.(update.thought_delta);
              }
              if (update.tool_call) {
                callbacks.onToolCall?.(update.tool_call);
              }
            } else if (currentEvent === 'result' || parsed.event === 'result') {
              const res = parsed.result || parsed;
              callbacks.onResult?.({
                response: res.response || '',
                usage: res.usage,
              });
            } else if (currentEvent === 'error' || parsed.event === 'error') {
              callbacks.onError?.(parsed.error || 'Unknown error');
            } else if (currentEvent === 'done') {
              callbacks.onDone?.();
            }
          } catch {
            // raw text line
            if (currentEvent === 'message') {
              callbacks.onDelta?.(dataStr);
            }
          }
        }
      }
    }
    callbacks.onDone?.();
  } catch (e: unknown) {
    if ((e as Error)?.name !== 'AbortError') {
      callbacks.onError?.((e as Error)?.message || 'Stream interrupted');
    }
  } finally {
    reader.releaseLock();
  }
}
