import { openUserTerminal, startGoogleLogin, pollLogin } from '../api';

class TerminalState {
  isOpen = $state(false);
  isMaximized = $state(false);
  terminalUrl = $state('');
  activeLoginId = $state<string | null>(null);
  isLoggingIn = $state(false);

  private loginPollingTimer: ReturnType<typeof setInterval> | null = null;

  public async openUserTerminal() {
    try {
      const res = await openUserTerminal();
      this.terminalUrl = res.terminal_url;
      this.activeLoginId = null;
      this.isOpen = true;
    } catch (e) {
      alert((e as Error)?.message || "Impossible d'ouvrir le terminal.");
    }
  }

  public async startGoogleLogin(onSuccess: () => Promise<void>) {
    if (this.isLoggingIn) return;
    this.isLoggingIn = true;
    try {
      const res = await startGoogleLogin();
      this.activeLoginId = res.login_id;
      this.terminalUrl = res.terminal_url;
      this.isOpen = true;

      this.clearPolling();
      this.loginPollingTimer = setInterval(async () => {
        if (!this.activeLoginId) return;
        try {
          const status = await pollLogin(this.activeLoginId);
          if (status.authenticated) {
            this.clearPolling();
            this.activeLoginId = null;
            this.isOpen = false;
            this.isLoggingIn = false;
            await onSuccess();
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors du lancement de la connexion Google');
    } finally {
      this.isLoggingIn = false;
    }
  }

  public async validateLoginManually(onSuccess: () => Promise<void>) {
    if (!this.activeLoginId) return;
    try {
      const status = await pollLogin(this.activeLoginId);
      if (status.authenticated) {
        this.clearPolling();
        this.activeLoginId = null;
        this.isOpen = false;
        await onSuccess();
      } else {
        alert("Connexion non détectée. Veuillez terminer l'authentification dans le terminal.");
      }
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la vérification');
    }
  }

  public closeTerminal() {
    this.isOpen = false;
    this.clearPolling();
    this.activeLoginId = null;
  }

  public toggleMaximized() {
    this.isMaximized = !this.isMaximized;
  }

  private clearPolling() {
    if (this.loginPollingTimer) {
      clearInterval(this.loginPollingTimer);
      this.loginPollingTimer = null;
    }
  }
}

export const terminalState = new TerminalState();
