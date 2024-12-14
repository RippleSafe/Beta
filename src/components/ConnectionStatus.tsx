import React from 'react';
import { useWallet } from '../contexts/WalletContext';

export const ConnectionStatus: React.FC = () => {
  const { connectionState } = useWallet();

  if (!connectionState.lastError && !connectionState.isConnecting) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {connectionState.isConnecting ? (
        <div className="bg-warning/10 text-warning px-4 py-2 rounded-lg flex items-center space-x-2">
          <div className="animate-spin h-4 w-4 border-2 border-warning border-t-transparent rounded-full" />
          <span>Connecting to network...</span>
        </div>
      ) : connectionState.lastError ? (
        <div className="bg-error/10 text-error px-4 py-2 rounded-lg">
          Network issues. Retrying...
        </div>
      ) : null}
    </div>
  );
}; 