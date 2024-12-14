import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { Client } from 'xrpl';
import { generateWallet, WalletData, getBalance } from '../utils/xrpl';
import { useXrpl } from './XrplContext';
import { debounce } from 'lodash';

interface CachedData {
  timestamp: number;
  data: any;
}

interface WalletContextType {
  wallet: WalletData | null;
  client: Client | null;
  error: string | null;
  isLoading: boolean;
  createWallet: () => Promise<void>;
  disconnectWallet: () => void;
  cachedBalances: Record<string, CachedData>;
  cachedAssets: Record<string, CachedData>;
  cachedTransactions: Record<string, CachedData>;
  setCachedBalance: (address: string, balance: string) => void;
  setCachedAssets: (address: string, assets: any[]) => void;
  setCachedTransactions: (address: string, transactions: any[]) => void;
  getCachedBalance: (address: string) => string | null;
  getCachedAssets: (address: string) => any[] | null;
  getCachedTransactions: (address: string) => any[] | null;
  connectionState: ConnectionState;
}

const CACHE_DURATION = 30000; // 30 seconds cache duration
const RETRY_DELAY = 2000; // 2 seconds between retries
const MAX_RETRIES = 3; // Maximum number of retries per node
const CONNECTION_TIMEOUT = 5000; // 5 seconds timeout for connections
const RECONNECT_DELAY = 5000; // 5 seconds between reconnection attempts
const MAX_CONCURRENT_CONNECTIONS = 3; // Maximum number of concurrent connection attempts

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

interface ConnectionState {
  isConnecting: boolean;
  currentNode: string;
  retryCount: number;
  lastError: string | null;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cachedBalances, setCachedBalances] = useState<Record<string, CachedData>>({});
  const [cachedAssets, setCachedAssetsState] = useState<Record<string, CachedData>>({});
  const [cachedTransactions, setCachedTransactionsState] = useState<Record<string, CachedData>>({});
  const { ensureConnection, disconnect } = useXrpl();
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnecting: false,
    currentNode: MAINNET_NODES[0],
    retryCount: 0,
    lastError: null
  });

  // Track active connection attempts
  const activeConnectionsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentClientRef = useRef<Client | null>(null);

  // Cleanup function for websocket connections
  const cleanupConnection = (oldClient: Client | null) => {
    if (oldClient) {
      try {
        oldClient.removeAllListeners();
        disconnect(oldClient);
      } catch (err) {
        console.warn('Error during connection cleanup:', err);
      }
    }
  };

  // Enhanced connection attempt with rate limiting
  const attemptConnection = async (nodeUrl: string): Promise<void> => {
    if (activeConnectionsRef.current >= MAX_CONCURRENT_CONNECTIONS) {
      console.warn('Too many concurrent connection attempts, skipping...');
      return;
    }

    activeConnectionsRef.current++;

    try {
      const newClient = new Client(nodeUrl);
      newClient.setMaxListeners(5); // Set reasonable limit for event listeners

      // Set connection timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
      });

      await Promise.race([
        ensureConnection(newClient),
        timeoutPromise
      ]);

      // Clean up old connection before setting new one
      cleanupConnection(currentClientRef.current);
      
      currentClientRef.current = newClient;
      setClient(newClient);
      setConnectionState(prev => ({
        ...prev,
        isConnecting: false,
        lastError: null,
        retryCount: 0
      }));

      // Set up connection monitoring
      newClient.on('disconnected', () => {
        console.log('Client disconnected, scheduling reconnection...');
        scheduleReconnection();
      });

    } catch (err: any) {
      handleConnectionError(err, nodeUrl);
    } finally {
      activeConnectionsRef.current--;
    }
  };

  // Debounced connection attempt
  const debouncedConnect = useMemo(
    () => debounce(attemptConnection, 1000, { leading: true, trailing: false }),
    []
  );

  // Schedule reconnection with backoff
  const scheduleReconnection = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const backoffDelay = Math.min(RECONNECT_DELAY * (connectionState.retryCount + 1), 30000);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (!currentClientRef.current?.isConnected()) {
        debouncedConnect(connectionState.currentNode);
      }
    }, backoffDelay);
  };

  const handleConnectionError = (err: any, nodeUrl: string) => {
    console.error(`Connection error for ${nodeUrl}:`, err);
    
    setConnectionState(prev => {
      const newState = {
        ...prev,
        retryCount: prev.retryCount + 1,
        lastError: err.message
      };

      // Switch nodes if max retries reached
      if (newState.retryCount >= MAX_RETRIES) {
        const currentIndex = MAINNET_NODES.indexOf(nodeUrl);
        const nextIndex = (currentIndex + 1) % MAINNET_NODES.length;
        
        return {
          ...newState,
          currentNode: MAINNET_NODES[nextIndex],
          retryCount: 0
        };
      }

      return newState;
    });

    scheduleReconnection();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      cleanupConnection(currentClientRef.current);
      debouncedConnect.cancel();
    };
  }, []);

  // Initial connection setup
  useEffect(() => {
    const initializeWalletAndConnection = async () => {
      if (!currentClientRef.current?.isConnected() && !connectionState.isConnecting) {
        setConnectionState(prev => ({ ...prev, isConnecting: true }));
        await debouncedConnect(connectionState.currentNode);
        
        // Check for existing wallet
        const storedWallet = localStorage.getItem('wallet');
        if (storedWallet) {
          try {
            const parsedWallet = JSON.parse(storedWallet);
            setWallet(parsedWallet);
          } catch (err) {
            console.error('Error parsing stored wallet:', err);
            localStorage.removeItem('wallet');
          }
        }
      }
    };

    initializeWalletAndConnection();
  }, []);

  const setCachedBalance = (address: string, balance: string) => {
    setCachedBalances(prev => ({
      ...prev,
      [address]: {
        timestamp: Date.now(),
        data: balance
      }
    }));
  };

  const updateCachedAssets = (address: string, assets: any[]) => {
    setCachedAssetsState(prev => ({
      ...prev,
      [address]: {
        data: assets,
        timestamp: Date.now()
      }
    }));
  };

  const setCachedTransactions = (address: string, transactions: any[]) => {
    setCachedTransactionsState(prev => ({
      ...prev,
      [address]: {
        data: transactions,
        timestamp: Date.now()
      }
    }));
  };

  const getCachedBalance = (address: string): string | null => {
    const cached = cachedBalances[address];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  };

  const getCachedAssets = (address: string): any[] | null => {
    const cached = cachedAssets[address];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  };

  const getCachedTransactions = (address: string): any[] | null => {
    const cached = cachedTransactions[address];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
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
    <WalletContext.Provider
      value={{
        wallet,
        client: currentClientRef.current,
        error,
        isLoading,
        createWallet,
        disconnectWallet: () => {
          cleanupConnection(currentClientRef.current);
          currentClientRef.current = null;
          setWallet(null);
          setError(null);
        },
        cachedBalances,
        cachedAssets,
        cachedTransactions,
        setCachedBalance,
        setCachedAssets: updateCachedAssets,
        setCachedTransactions,
        getCachedBalance,
        getCachedAssets,
        getCachedTransactions,
        connectionState,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}; 