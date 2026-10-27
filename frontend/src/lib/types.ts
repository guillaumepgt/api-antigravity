export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

export interface UsageInfo {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  total_tokens?: number;
  duration_seconds?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  usage?: UsageInfo;
}

export interface Conversation {
  conversation_id: string;
  title: string;
  preview: string;
  last_modified_time: string;
  step_count: number;
  status?: string;
}

export interface Model {
  id: string;
  name: string;
}

export interface AppSettings {
  apiKey: string;
  selectedModel: string;
  mode: 'auto' | 'accept-edits' | 'plan';
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  dangerouslySkipPermissions: boolean;
}

export interface McpServer {
  name: string;
  server_type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  serverUrl?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  disabled: boolean;
}

export interface McpPreset {
  id: string;
  name: string;
  title: string;
  description: string;
  icon: string;
  category: 'browser' | 'system' | 'web' | 'developer' | string;
  server_type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  serverUrl?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

