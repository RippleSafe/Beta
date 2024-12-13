import React, { createContext, useContext, useState, useEffect } from 'react';
import { Client } from 'xrpl';
import { generateWallet, WalletData } from '../utils/xrpl';
import { useXrpl } from './XrplContext';

interface WalletContextType {
  wallet: WalletData | null;
  client: Client | null;
  error: string | null;
  isLoading: boolean;
  createWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: React.ReactNode;
}

const MAINNET_NODES = [
  'wss://xrplcluster.com',
  'wss://s1.ripple.com',
  'wss://s2.ripple.com'
];

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);
  const { ensureConnection, disconnect } = useXrpl();

  useEffect(() => {
    initializeWallet();
    return () => {
      if (client) {
        disconnect(client);
      }
    };
  }, []);

  const switchToNextNode = () => {
    setCurrentNodeIndex((prevIndex) => (prevIndex + 1) % MAINNET_NODES.length);
    return MAINNET_NODES[(currentNodeIndex + 1) % MAINNET_NODES.length];
  };

  const initializeWallet = async () => {
    let retryCount = 0;
    const maxRetries = MAINNET_NODES.length * 2; // Allow cycling through nodes twice

    while (retryCount < maxRetries) {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize XRPL client with current node
        const nodeUrl = MAINNET_NODES[currentNodeIndex];
        console.log(`Attempting to connect to ${nodeUrl}`);
        
        const newClient = new Client(nodeUrl);
        
        // Try to connect with exponential backoff
        await ensureConnection(newClient);
        
        setClient(newClient);
        console.log(`Successfully connected to ${nodeUrl}`);

        // Check for existing wallet
        const storedWallet = localStorage.getItem('wallet');
        if (storedWallet) {
          const parsedWallet = JSON.parse(storedWallet);
          if (parsedWallet && !parsedWallet.mnemonic) {
            console.warn('Stored wallet does not contain mnemonic phrase');
          }
          setWallet(parsedWallet);
        }

        // If we get here, connection was successful
        break;

      } catch (err: any) {
        console.error('Error initializing wallet:', err);
        
        if (err.message?.includes('noPermission') || err.message?.includes('WebSocket')) {
          // Try next node on permission or connection errors
          const nextNode = switchToNextNode();
          console.log(`Switching to next node: ${nextNode}`);
          retryCount++;
          
          // Add delay before retry
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, retryCount), 10000)));
          
        } else {
          setError('Failed to initialize wallet');
          break;
        }
      }
    }

    if (retryCount >= maxRetries) {
      setError('Unable to connect to any XRPL nodes. Please try again later.');
    }

    setIsLoading(false);
  };

  const createWallet = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!client) {
        throw new Error('No client connection available');
      }

      await ensureConnection(client);
      const newWallet = await generateWallet(client);
      
      // Store wallet data
      localStorage.setItem('wallet', JSON.stringify(newWallet));
      setWallet(newWallet);

    } catch (err: any) {
      console.error('Error creating wallet:', err);
      setError(err.message || 'Failed to create wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectWallet = () => {
    if (client) {
      disconnect(client);
    }
    localStorage.removeItem('wallet');
    setWallet(null);
    setError(null);
  };

  return (
    <WalletContext.Provider value={{
      wallet,
      client,
      error,
      isLoading,
      createWallet,
      disconnectWallet
    }}>
      {children}
    </WalletContext.Provider>
  );
}; 