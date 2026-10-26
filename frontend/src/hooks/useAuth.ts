import { useState, useEffect, useCallback } from 'react';
import { fetchMe, checkHealth, logoutSession, clearSession } from '../lib/api';
import { tabSync } from '../lib/tabSync';

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

export function useAuth(onClearApiKey?: () => void) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(checkHasStoredAuth);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const initAuth = useCallback(async (onSuccess?: () => Promise<void>) => {
    try {
      const [meResult, healthResult] = await Promise.allSettled([
        fetchMe(),
        checkHealth(),
      ]);

      if (healthResult.status === 'fulfilled') {
        setIsConnected(true);
      }

      if (meResult.status === 'fulfilled' && meResult.value.authenticated) {
        setIsAuthenticated(true);
        setUserEmail(meResult.value.email || '');
        setUserId(meResult.value.user_id || 'default');
        if (onSuccess) {
          await onSuccess();
        }
      } else {
        setIsAuthenticated(false);
        clearSession();
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  const logout = useCallback(async (onAfterLogout?: () => void) => {
    if (confirm(`Voulez-vous vraiment vous déconnecter de votre compte ${userEmail} ?`)) {
      await logoutSession();
      setIsAuthenticated(false);
      setUserEmail('');
      setUserId('');
      onClearApiKey?.();
      tabSync.broadcast({ type: 'USER_LOGGED_OUT' });
      window.history.replaceState({}, '', '/');
      onAfterLogout?.();
    }
  }, [userEmail, onClearApiKey]);

  useEffect(() => {
    const unsubscribe = tabSync.subscribe((event) => {
      if (event.type === 'USER_LOGGED_OUT') {
        setIsAuthenticated(false);
        setUserEmail('');
        setUserId('');
        onClearApiKey?.();
        clearSession();
      }
    });
    return unsubscribe;
  }, [onClearApiKey]);

  return {
    isAuthenticated,
    isCheckingAuth,
    userEmail,
    userId,
    isConnected,
    initAuth,
    logout,
    setIsAuthenticated,
  };
}
