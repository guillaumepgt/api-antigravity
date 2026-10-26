import { useState, useRef, useCallback } from 'react';
import { openUserTerminal as apiOpenUserTerminal, startGoogleLogin as apiStartGoogleLogin, pollLogin } from '../lib/api';

export function useTerminal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState('');
  const [activeLoginId, setActiveLoginId] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const openUserTerminal = useCallback(async () => {
    try {
      const res = await apiOpenUserTerminal();
      setTerminalUrl(res.terminal_url);
      setActiveLoginId(null);
      setIsOpen(true);
    } catch (e) {
      alert((e as Error)?.message || "Impossible d'ouvrir le terminal.");
    }
  }, []);

  const startGoogleLogin = useCallback(async (onSuccess: () => Promise<void>) => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const res = await apiStartGoogleLogin();
      setActiveLoginId(res.login_id);
      setTerminalUrl(res.terminal_url);
      setIsOpen(true);

      clearPolling();
      pollingTimerRef.current = setInterval(async () => {
        try {
          const status = await pollLogin(res.login_id);
          if (status.authenticated) {
            clearPolling();
            setActiveLoginId(null);
            setIsOpen(false);
            setIsLoggingIn(false);
            await onSuccess();
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors du lancement de la connexion Google');
    } finally {
      setIsLoggingIn(false);
    }
  }, [isLoggingIn, clearPolling]);

  const validateLoginManually = useCallback(async (onSuccess: () => Promise<void>) => {
    if (!activeLoginId) return;
    try {
      const status = await pollLogin(activeLoginId);
      if (status.authenticated) {
        clearPolling();
        setActiveLoginId(null);
        setIsOpen(false);
        await onSuccess();
      } else {
        alert("Connexion non détectée. Veuillez terminer l'authentification dans le terminal.");
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la vérification');
    }
  }, [activeLoginId, clearPolling]);

  const closeTerminal = useCallback(() => {
    setIsOpen(false);
    clearPolling();
    setActiveLoginId(null);
  }, [clearPolling]);

  const toggleMaximized = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  return {
    isOpen,
    isMaximized,
    terminalUrl,
    activeLoginId,
    isLoggingIn,
    openUserTerminal,
    startGoogleLogin,
    validateLoginManually,
    closeTerminal,
    toggleMaximized,
  };
}
