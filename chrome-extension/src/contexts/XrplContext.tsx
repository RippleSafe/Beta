import React, { createContext, useContext, useCallback } from 'react';
import { Client } from 'xrpl';

interface XrplContextType {
  ensureConnection: (client: Client) => Promise<void>;
}

const XrplContext = createContext<XrplContextType | undefined>(undefined);

export const useXrpl = () => {
  const context = useContext(XrplContext);
  if (!context) {
    throw new Error('useXrpl must be used within an XrplProvider');
  }
  return context;
};

export const XrplProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ensureConnection = useCallback(async (client: Client) => {
    if (!client.isConnected()) {
      await client.connect();
    }
  }, []);

  return (
    <XrplContext.Provider value={{ ensureConnection }}>
      {children}
    </XrplContext.Provider>
  );
}; 