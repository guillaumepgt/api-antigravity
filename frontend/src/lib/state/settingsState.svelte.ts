import type { AppSettings, Model } from '../types';
import {
  getStoredSettings,
  saveStoredSettings,
  fetchModels,
  fetchUserKey,
  type UserKeyInfo,
} from '../api';

class SettingsState {
  settings = $state<AppSettings>(getStoredSettings());
  models = $state<Model[]>([]);
  keyInfo = $state<UserKeyInfo | null>(null);
  isSettingsOpen = $state(false);
  isApiKeyModalOpen = $state(false);

  currentModelName = $derived(
    this.models.find((m) => m.id === this.settings.selectedModel)?.name || this.settings.selectedModel
  );

  public updateSettings(newSettings: AppSettings) {
    this.settings = { ...newSettings };
    saveStoredSettings(this.settings);
  }

  public setApiKey(apiKey: string) {
    this.settings = { ...this.settings, apiKey };
    saveStoredSettings(this.settings);
    if (this.keyInfo) {
      this.keyInfo.api_key = apiKey;
    }
  }

  public selectModel(modelId: string) {
    let newEffort = this.settings.effort;
    if (modelId.endsWith('-low')) newEffort = 'low';
    else if (modelId.endsWith('-medium')) newEffort = 'medium';
    else if (modelId.endsWith('-high')) newEffort = 'high';
    else if (modelId.endsWith('-xhigh')) newEffort = 'xhigh';
    else if (modelId.endsWith('-max')) newEffort = 'max';

    this.settings = {
      ...this.settings,
      selectedModel: modelId,
      effort: newEffort,
    };
    saveStoredSettings(this.settings);
  }

  public async loadModels() {
    try {
      const m = await fetchModels(this.settings.apiKey);
      this.models = m;
      if (m.length > 0 && !m.some((item) => item.id === this.settings.selectedModel)) {
        this.settings.selectedModel = m[0].id;
        saveStoredSettings(this.settings);
      }
    } catch (e) {
      console.warn('Failed to fetch models', e);
    }
  }

  public async loadUserKey() {
    try {
      const k = await fetchUserKey();
      this.keyInfo = k;
      if (k?.api_key && (!this.settings.apiKey || this.settings.apiKey.trim() === '')) {
        this.settings.apiKey = k.api_key;
        saveStoredSettings(this.settings);
      }
    } catch (e) {
      console.warn('Failed to fetch user key', e);
    }
  }

  public openSettings() {
    this.isSettingsOpen = true;
  }

  public closeSettings() {
    this.isSettingsOpen = false;
  }

  public openApiKeyModal() {
    this.isApiKeyModalOpen = true;
  }

  public closeApiKeyModal() {
    this.isApiKeyModalOpen = false;
  }
}

export const settingsState = new SettingsState();
