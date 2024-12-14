import React, { createContext, useContext, useCallback } from 'react';

interface Asset {
  currency: string;
  issuer: string;
  balance: number;
  limit: string;
  info: {
    name: string;
    symbol: string;
    issuerName: string;
    icon?: string;
  };
}

interface WalletContextType {
  getCachedBalance: (address: string) => string | null;
  setCachedBalance: (address: string, balance: string) => void;
  getCachedAssets: (address: string) => Asset[] | null;
  setCachedAssets: (address: string, assets: Asset[]) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getCachedBalance = useCallback((address: string) => {
    try {
      return localStorage.getItem(`balance_${address}`);
    } catch (error) {
      console.error('Error getting cached balance:', error);
      return null;
    }
  }, []);

  const setCachedBalance = useCallback((address: string, balance: string) => {
    try {
      localStorage.setItem(`balance_${address}`, balance);
    } catch (error) {
      console.error('Error setting cached balance:', error);
    }
  }, []);

  const getCachedAssets = useCallback((address: string) => {
    try {
      const cached = localStorage.getItem(`assets_${address}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error getting cached assets:', error);
      return null;
    }
  }, []);

  const setCachedAssets = useCallback((address: string, assets: Asset[]) => {
    try {
      localStorage.setItem(`assets_${address}`, JSON.stringify(assets));
    } catch (error) {
      console.error('Error setting cached assets:', error);
    }
  }, []);

  return (
    <WalletContext.Provider value={{
      getCachedBalance,
      setCachedBalance,
      getCachedAssets,
      setCachedAssets,
    }}>
      {children}
    </WalletContext.Provider>
  );
}; 