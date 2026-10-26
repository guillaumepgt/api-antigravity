import { fetchMe, checkHealth, logoutSession, clearSession } from '../api';
import { tabSync } from './tabSync';
import { settingsState } from './settingsState.svelte';

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

class AuthState {
  isAuthenticated = $state(checkHasStoredAuth());
  isCheckingAuth = $state(true);
  userEmail = $state('');
  userId = $state('');
  isConnected = $state(false);

  constructor() {
    tabSync.subscribe((event) => {
      if (event.type === 'USER_LOGGED_OUT') {
        this.handleRemoteLogout();
      }
    });
  }

  public async initAuth(onSuccess?: () => Promise<void>) {
    try {
      const [meResult, healthResult] = await Promise.allSettled([
        fetchMe(),
        checkHealth(),
      ]);

      if (healthResult.status === 'fulfilled') {
        this.isConnected = true;
      }

      if (meResult.status === 'fulfilled' && meResult.value.authenticated) {
        this.isAuthenticated = true;
        this.userEmail = meResult.value.email || '';
        this.userId = meResult.value.user_id || 'default';
        if (onSuccess) {
          await onSuccess();
        }
      } else {
        this.isAuthenticated = false;
        clearSession();
      }
    } catch {
      this.isAuthenticated = false;
    } finally {
      this.isCheckingAuth = false;
    }
  }

  public async logout(onAfterLogout?: () => void) {
    if (confirm(`Voulez-vous vraiment vous déconnecter de votre compte ${this.userEmail} ?`)) {
      await logoutSession();
      this.isAuthenticated = false;
      this.userEmail = '';
      this.userId = '';
      settingsState.setApiKey('');
      tabSync.broadcast({ type: 'USER_LOGGED_OUT' });
      window.history.replaceState({}, '', '/');
      if (onAfterLogout) {
        onAfterLogout();
      }
    }
  }

  public handleRemoteLogout() {
    this.isAuthenticated = false;
    this.userEmail = '';
    this.userId = '';
    settingsState.setApiKey('');
    clearSession();
  }
}

export const authState = new AuthState();
