export type TabSyncEvent =
  | { type: 'CONVERSATION_DELETED'; id: string }
  | { type: 'CONVERSATIONS_CLEARED' }
  | { type: 'REFRESH_CONVERSATIONS' }
  | { type: 'USER_LOGGED_OUT' };

class TabSyncManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Array<(event: TabSyncEvent) => void> = [];

  constructor() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('antigravity_tab_sync');
        this.channel.onmessage = (ev: MessageEvent<TabSyncEvent>) => {
          if (ev.data && ev.data.type) {
            for (const listener of this.listeners) {
              try {
                listener(ev.data);
              } catch (e) {
                console.error('Error in TabSync listener', e);
              }
            }
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported or failed to initialize', e);
      }
    }
  }

  public subscribe(listener: (event: TabSyncEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public broadcast(event: TabSyncEvent): void {
    try {
      this.channel?.postMessage(event);
    } catch {}
  }

  public close(): void {
    try {
      this.channel?.close();
    } catch {}
  }
}

export const tabSync = new TabSyncManager();
