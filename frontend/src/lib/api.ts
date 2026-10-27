import type { AppSettings, Conversation, Model, UsageInfo, McpServer, McpPreset } from './types';

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

export function getSessionToken(): string {
  try {
    const token = localStorage.getItem('antigravity_session_token');
    if (token && token.trim()) {
      return token.trim();
    }
    if (typeof document !== 'undefined' && document.cookie) {
      for (const pair of document.cookie.split(';')) {
        const [k, v] = pair.trim().split('=');
        if (k === 'antigravity_session' && v && v.trim()) {
          return decodeURIComponent(v.trim());
        }
      }
    }
  } catch (e) {
    console.error('Error reading antigravity_session_token', e);
  }
  return '';
}

export function setSessionToken(token: string) {
  try {
    if (token && token.trim()) {
      localStorage.setItem('antigravity_session_token', token.trim());
      document.cookie = `antigravity_session=${encodeURIComponent(token.trim())}; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      localStorage.removeItem('antigravity_session_token');
      document.cookie = 'antigravity_session=; path=/; max-age=0; SameSite=Lax';
      document.cookie = 'antigravity_token=; path=/; max-age=0; SameSite=Lax';
    }
  } catch (e) {
    console.error('Error saving session token', e);
  }
}

export function clearSession() {
  setSessionToken('');
  try {
    localStorage.removeItem('antigravity_user_email');
    localStorage.removeItem('antigravity_user_id');
    const s = getStoredSettings();
    if (s.apiKey) {
      s.apiKey = '';
      saveStoredSettings(s);
    }
  } catch {}
}

function getHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const sessionToken = getSessionToken();
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else {
    const key = apiKey || getStoredSettings().apiKey;
    if (key && key.trim().length > 0) {
      headers['Authorization'] = `Bearer ${key.trim()}`;
    }
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

export async function fetchMe(): Promise<{ authenticated: boolean; email?: string; user_id?: string; token?: string }> {
  try {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      return { authenticated: false };
    }
    const res = await fetch('/api/auth/me', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    if (!res.ok) {
      clearSession();
      return { authenticated: false };
    }
    const data = await res.json();
    if (data.authenticated && data.token) {
      setSessionToken(data.token);
    } else {
      clearSession();
    }
    return data;
  } catch {
    return { authenticated: false };
  }
}

export async function startGoogleLogin(): Promise<{ login_id: string; ticket: string; terminal_url: string }> {
  const res = await fetch('/api/auth/start-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to start Google login: ${res.statusText}`);
  }
  return res.json();
}

export async function pollLogin(loginId: string): Promise<{ authenticated: boolean; token?: string; email?: string; user_id?: string }> {
  const res = await fetch(`/api/auth/check-login?login_id=${encodeURIComponent(loginId)}`);
  if (!res.ok) {
    return { authenticated: false };
  }
  const data = await res.json();
  if (data.authenticated && data.token) {
    setSessionToken(data.token);
  }
  return data;
}

export async function openUserTerminal(): Promise<{ ticket: string; terminal_url: string }> {
  const res = await fetch('/api/terminal/token', {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to create terminal token (${res.status})`);
  }
  return res.json();
}

export async function logoutSession(): Promise<void> {
  try {
    const sessionToken = getSessionToken();
    if (sessionToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
      });
    }
  } catch {
    // Ignore network error on logout
  } finally {
    clearSession();
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
  const res = await fetch('/api/user/key', {
    headers: getHeaders(),
  });
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

export async function deleteConversation(conversationId: string, apiKey?: string): Promise<{ status: string }> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete conversation: ${res.statusText}`);
  }
  return res.json();
}

export async function clearAllConversations(apiKey?: string): Promise<{ status: string; deleted_count: number }> {
  const res = await fetch('/api/conversations/clear', {
    method: 'POST',
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Failed to clear all conversations: ${res.statusText}`);
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

export async function fetchMcpServers(apiKey?: string): Promise<McpServer[]> {
  const res = await fetch('/api/mcp', {
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch MCP servers: ${res.statusText}`);
  }
  const data = await res.json();
  return data.servers || [];
}

export async function fetchMcpPresets(apiKey?: string): Promise<McpPreset[]> {
  const res = await fetch('/api/mcp/presets', {
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch MCP presets: ${res.statusText}`);
  }
  const data = await res.json();
  return data.presets || [];
}

export async function saveMcpServer(server: McpServer, apiKey?: string): Promise<{ status: string; server: McpServer }> {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(server),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to save MCP server');
  }
  return res.json();
}

export async function deleteMcpServer(name: string, apiKey?: string): Promise<{ status: string }> {
  const res = await fetch(`/api/mcp/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to delete MCP server');
  }
  return res.json();
}

export async function toggleMcpServer(name: string, disabled?: boolean, apiKey?: string): Promise<{ status: string; name: string; disabled: boolean }> {
  const res = await fetch(`/api/mcp/${encodeURIComponent(name)}/toggle`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify({ disabled }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to toggle MCP server');
  }
  return res.json();
}

