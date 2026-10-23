import type { Conversation } from './types';

export function formatRelativeDate(isoStr: string, mockNow?: Date): string {
  if (!isoStr) return '';
  try {
    const date = new Date(isoStr);
    const now = mockNow || new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return isoStr;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 2) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `Aujourd'hui, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays === 1 || (diffHours < 48 && date.getDate() === now.getDate() - 1)) {
      return `Hier, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

export function filterConversations(conversations: Conversation[], query: string): Conversation[] {
  if (!query || !query.trim()) return conversations;
  const q = query.toLowerCase().trim();
  return conversations.filter(
    (c) =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.preview || '').toLowerCase().includes(q) ||
      (c.conversation_id || '').toLowerCase().includes(q)
  );
}

export function sanitizeUserRequest(raw: string): string {
  if (!raw) return '';
  const match = raw.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return raw.trim();
}

export function generateSnippet(tab: string, apiKey: string, baseUrl = 'http://localhost:8080'): string {
  const key = apiKey || 'ag_live_sec_demo_9824f9b8c11e';
  switch (tab) {
    case 'claude_code':
      return `# === Utiliser avec Claude Code (Anthropic CLI) ===

export ANTHROPIC_BASE_URL="${baseUrl}"
export ANTHROPIC_API_KEY="${key}"

claude`;

    case 'cursor_aider':
      return `# === Utiliser avec Aider, Cursor, Continue, Cline (Format OpenAI) ===

export OPENAI_API_BASE="${baseUrl}/v1"
export OPENAI_API_KEY="${key}"

aider --model claude-sonnet-4-6`;

    case 'curl':
      return `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-3.8-flash-high",
    "messages": [{"role": "user", "content": "Ping!"}]
  }'`;

    case 'python':
      return `import openai

client = openai.OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${key}"
)

response = client.chat.completions.create(
    model="gemini-3.8-flash-high",
    messages=[{"role": "user", "content": "Audit this codebase."}]
)
print(response.choices[0].message.content)`;

    case 'js':
      return `const response = await fetch('${baseUrl}/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${key}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gemini-3.8-flash-high',
    messages: [{ role: 'user', content: 'Bonjour Antigravity !' }],
    stream: false
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);`;

    default:
      return '';
  }
}
