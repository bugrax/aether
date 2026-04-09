import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { vaultsAPI, setCurrentVaultId as setApiVaultId } from '../api';
import { useAuth } from './AuthContext';

const VaultContext = createContext(null);

export function VaultProvider({ children }) {
  const { user } = useAuth();
  const [vaults, setVaults] = useState([]);
  const [currentVault, setCurrentVaultState] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadVaults = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const data = await vaultsAPI.list();
      const list = data.vaults || [];
      setVaults(list);

      // Restore current vault from localStorage, or pick default
      const storedId = localStorage.getItem('aether_current_vault_id');
      let current = list.find(v => v.id === storedId);
      if (!current) {
        current = list.find(v => v.is_default) || list[0];
      }
      if (current) {
        setCurrentVaultState(current);
        setApiVaultId(current.id);
        localStorage.setItem('aether_current_vault_id', current.id);
      }
    } catch (err) {
      console.error('Failed to load vaults:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadVaults();
  }, [user, loadVaults]);

  const setCurrentVault = useCallback((vault) => {
    setCurrentVaultState(vault);
    setApiVaultId(vault.id);
    localStorage.setItem('aether_current_vault_id', vault.id);
    // Notify other parts of the app to refresh
    window.dispatchEvent(new Event('vault-changed'));
  }, []);

  const createVault = useCallback(async (data) => {
    const result = await vaultsAPI.create(data);
    await loadVaults();
    return result.vault;
  }, [loadVaults]);

  const updateVault = useCallback(async (id, data) => {
    await vaultsAPI.update(id, data);
    await loadVaults();
  }, [loadVaults]);

  const deleteVault = useCallback(async (id) => {
    await vaultsAPI.delete(id);
    // If deleted vault was current, clear
    if (currentVault?.id === id) {
      localStorage.removeItem('aether_current_vault_id');
      setCurrentVaultState(null);
    }
    await loadVaults();
    window.dispatchEvent(new Event('vault-changed'));
  }, [currentVault, loadVaults]);

  const setDefaultVault = useCallback(async (id) => {
    await vaultsAPI.setDefault(id);
    await loadVaults();
  }, [loadVaults]);

  return (
    <VaultContext.Provider value={{
      vaults,
      currentVault,
      currentVaultId: currentVault?.id,
      loading,
      setCurrentVault,
      createVault,
      updateVault,
      deleteVault,
      setDefaultVault,
      refresh: loadVaults,
    }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}
