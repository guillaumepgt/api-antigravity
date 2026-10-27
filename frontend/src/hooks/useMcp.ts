import { useState, useEffect, useCallback } from 'react';
import type { McpServer, McpPreset } from '../lib/types';
import {
  fetchMcpServers,
  fetchMcpPresets,
  saveMcpServer,
  deleteMcpServer,
  toggleMcpServer,
} from '../lib/api';

export function useMcp(isAuthenticated: boolean) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [presets, setPresets] = useState<McpPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const [fetchedServers, fetchedPresets] = await Promise.all([
        fetchMcpServers(),
        fetchMcpPresets(),
      ]);
      setServers(fetchedServers);
      setPresets(fetchedPresets);
    } catch (e: unknown) {
      console.error('Failed to load MCP servers or presets:', e);
      setError((e as Error)?.message || 'Erreur lors du chargement des serveurs MCP');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addOrUpdate = async (server: McpServer) => {
    setActionLoading(server.name);
    setError(null);
    try {
      await saveMcpServer(server);
      await loadData();
      return true;
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Erreur lors de la sauvegarde du serveur MCP';
      setError(msg);
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const remove = async (name: string) => {
    setActionLoading(name);
    setError(null);
    try {
      await deleteMcpServer(name);
      await loadData();
      return true;
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Erreur lors de la suppression du serveur MCP';
      setError(msg);
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const toggle = async (name: string, disabled?: boolean) => {
    setActionLoading(name);
    setError(null);
    try {
      await toggleMcpServer(name, disabled);
      await loadData();
      return true;
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Erreur lors du changement d’état du serveur MCP';
      setError(msg);
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const installPreset = async (preset: McpPreset) => {
    const server: McpServer = {
      name: preset.name,
      server_type: preset.server_type as 'stdio' | 'http',
      command: preset.command,
      args: preset.args,
      serverUrl: preset.serverUrl,
      env: preset.env,
      headers: preset.headers,
      disabled: false,
    };
    return addOrUpdate(server);
  };

  return {
    servers,
    presets,
    loading,
    actionLoading,
    error,
    refresh: loadData,
    addOrUpdate,
    remove,
    toggle,
    installPreset,
  };
}
