import { useState, useCallback, useMemo } from 'react';
import type { AppSettings, Model } from '../lib/types';
import {
  getStoredSettings,
  saveStoredSettings,
  fetchModels,
  fetchUserKey,
  type UserKeyInfo,
} from '../lib/api';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings);
  const [models, setModels] = useState<Model[]>([]);
  const [keyInfo, setKeyInfo] = useState<UserKeyInfo | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const currentModelName = useMemo(() => {
    return models.find((m) => m.id === settings.selectedModel)?.name || settings.selectedModel;
  }, [models, settings.selectedModel]);

  const updateSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    saveStoredSettings(newSettings);
  }, []);

  const setApiKey = useCallback((apiKey: string) => {
    setSettings((prev) => {
      const next = { ...prev, apiKey };
      saveStoredSettings(next);
      return next;
    });
    setKeyInfo((prev) => (prev ? { ...prev, api_key: apiKey } : null));
  }, []);

  const selectModel = useCallback((modelId: string) => {
    let newEffort = settings.effort;
    if (modelId.endsWith('-low')) newEffort = 'low';
    else if (modelId.endsWith('-medium')) newEffort = 'medium';
    else if (modelId.endsWith('-high')) newEffort = 'high';
    else if (modelId.endsWith('-xhigh')) newEffort = 'xhigh';
    else if (modelId.endsWith('-max')) newEffort = 'max';

    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        selectedModel: modelId,
        effort: newEffort,
      };
      saveStoredSettings(next);
      return next;
    });
  }, [settings.effort]);

  const loadModels = useCallback(async () => {
    try {
      const m = await fetchModels(settings.apiKey);
      setModels(m);
      if (m.length > 0 && !m.some((item) => item.id === settings.selectedModel)) {
        setSettings((prev) => {
          const next = { ...prev, selectedModel: m[0].id };
          saveStoredSettings(next);
          return next;
        });
      }
    } catch (e) {
      console.warn('Failed to fetch models', e);
    }
  }, [settings.apiKey, settings.selectedModel]);

  const loadUserKey = useCallback(async () => {
    try {
      const k = await fetchUserKey();
      setKeyInfo(k);
      if (k?.api_key && (!settings.apiKey || settings.apiKey.trim() === '')) {
        setSettings((prev) => {
          const next = { ...prev, apiKey: k.api_key };
          saveStoredSettings(next);
          return next;
        });
      }
    } catch (e) {
      console.warn('Failed to fetch user key', e);
    }
  }, [settings.apiKey]);

  return {
    settings,
    models,
    keyInfo,
    isSettingsOpen,
    isApiKeyModalOpen,
    currentModelName,
    updateSettings,
    setApiKey,
    selectModel,
    loadModels,
    loadUserKey,
    openSettings: () => setIsSettingsOpen(true),
    closeSettings: () => setIsSettingsOpen(false),
    openApiKeyModal: () => setIsApiKeyModalOpen(true),
    closeApiKeyModal: () => setIsApiKeyModalOpen(false),
  };
}
