import React, { createContext, useContext, useRef, useCallback, useState, useEffect } from 'react';
import { Client, ClientOptions, XrplError } from 'xrpl';
import { WebSocket } from 'ws';

type NodeUrl = 
  | 'wss://xrpl.ws'
  | 'wss://s1.ripple.com'
  | 'wss://s2.ripple.com'
  | 'wss://xrplcluster.com';

interface XrplContextType {
  ensureConnection: (client: Client) => Promise<void>;
  disconnect: (client: Client) => Promise<void>;
  isConnecting: boolean;
  currentNode: NodeUrl;
}

const XrplContext = createContext<XrplContextType | null>(null);

const MAINNET_NODES: readonly NodeUrl[] = [
  'wss://xrpl.ws',
  'wss://s1.ripple.com',
  'wss://s2.ripple.com',
  'wss://xrplcluster.com'
] as const;

const RECONNECT_DELAY = 2000;
const MAX_BACKOFF_DELAY = 30000;
const CONNECTION_TIMEOUT = 15000;
const IDLE_TIMEOUT = 120000;

const DEFAULT_CLIENT_OPTIONS: ClientOptions = {
  timeout: 20000,
  connectionTimeout: 15000,
  trace: false
};

// Define message type
interface XrplMessage {
  type: string;
  status: string;
  error?: string;
}

// Define custom types for error handling
interface XrplMessage {
  type: string;
  status: string;
  error?: string;
}

type ErrorCallback = (error: Error | XrplError) => void;

export const useXrpl = () => {
  const context = useContext(XrplContext);
  if (!context) {
    throw new Error('useXrpl must be used within XrplProvider');
  }
  return context;
};

export const XrplProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentNode, setCurrentNode] = useState<NodeUrl>(MAINNET_NODES[0]);
  
  const connectionRef = useRef<{
    client: Client | null;
    promise: Promise<void> | null;
    timeoutId: NodeJS.Timeout | null;
    reconnectAttempts: number;
    isClosing: boolean;
    lastConnectTime: number;
    backoffTime: number;
    currentNodeIndex: number;
    activeConnections: Set<Client>;
  }>({
    client: null,
    promise: null,
    timeoutId: null,
    reconnectAttempts: 0,
    isClosing: false,
    lastConnectTime: 0,
    backoffTime: RECONNECT_DELAY,
    currentNodeIndex: 0,
    activeConnections: new Set()
  });

  const handleClientError = useCallback((error: any, client: Client) => {
    console.error('Client error:', error);
    
    // Handle specific error types
    if (error instanceof XrplError) {
      if (error.message.includes('disconnected') || error.message.includes('not connected')) {
        cleanup(client).catch(console.error);
      }
    }
    
    // Handle unhandled errors
    if (error && !error.handled) {
      error.handled = true;
      console.error('Unhandled client error:', error);
      cleanup(client).catch(console.error);
    }
  }, []);

  const createClient = useCallback((url: NodeUrl): Client => {
    const client = new Client(url, {
      ...DEFAULT_CLIENT_OPTIONS,
      timeout: 30000,
      connectionTimeout: 20000
    });
    
    // Handle all possible error events
    client.on('error', (error) => handleClientError(error, client));
    client.on('disconnected', () => {
      console.log('Client disconnected from', url);
      cleanup(client).catch(console.error);
    });
    client.on('connected', () => {
      console.log('Client connected to', url);
    });
    
    // Handle unhandled errors
    client.connection.on('error', (error: Error | XrplError) => handleClientError(error, client));
    
    // Handle client errors
    client.on('error', (error: Error | XrplError) => {
      handleClientError(error, client);
    });

    // Handle message responses
    client.connection.on('message', (message: XrplMessage) => {
      if (message.type === 'response' && message.status === 'error') {
        handleClientError(new Error(message.error || 'Unknown error'), client);
      }
    });

    return client;
  }, [handleClientError]);

  useEffect(() => {
    return () => {
      const activeConnections = Array.from(connectionRef.current.activeConnections);
      activeConnections.forEach(client => {
        cleanup(client).catch(console.error);
      });
    };
  }, []);

  const cleanup = useCallback(async (client?: Client) => {
    if (!client && connectionRef.current.isClosing) {
      return;
    }

    if (client) {
      connectionRef.current.activeConnections.delete(client);
    } else {
      connectionRef.current.isClosing = true;
    }

    try {
      if (connectionRef.current.timeoutId) {
        clearTimeout(connectionRef.current.timeoutId);
        connectionRef.current.timeoutId = null;
      }

      const clientToCleanup = client || connectionRef.current.client;
      if (clientToCleanup) {
        try {
          // Remove all listeners before disconnecting
          clientToCleanup.removeAllListeners();
          if (clientToCleanup.connection) {
            clientToCleanup.connection.removeAllListeners();
            // Remove connection-specific listeners
            clientToCleanup.connection.removeAllListeners();
          }
          
          if (clientToCleanup.isConnected()) {
            await clientToCleanup.disconnect();
          }
        } catch (error) {
          console.error('Error during disconnect:', error);
        }
      }
    } finally {
      if (!client) {
        connectionRef.current = {
          client: null,
          promise: null,
          timeoutId: null,
          reconnectAttempts: 0,
          isClosing: false,
          lastConnectTime: 0,
          backoffTime: RECONNECT_DELAY,
          currentNodeIndex: 0,
          activeConnections: new Set()
        };
        setIsConnecting(false);
      }
    }
  }, []);

  const switchToNextNode = useCallback(async (currentClient: Client): Promise<Client> => {
    await cleanup(currentClient);
    
    let attempts = 0;
    while (attempts < MAINNET_NODES.length) {
      connectionRef.current.currentNodeIndex = (connectionRef.current.currentNodeIndex + 1) % MAINNET_NODES.length;
      const nextNode = MAINNET_NODES[connectionRef.current.currentNodeIndex];
      setCurrentNode(nextNode);
      
      try {
        const newClient = createClient(nextNode);
        console.log(`Attempting connection to node: ${nextNode}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return newClient;
      } catch (error) {
        console.error(`Failed to initialize client for node ${nextNode}:`, error);
        attempts++;
      }
    }
    
    throw new Error('Failed to connect to any available nodes');
  }, [cleanup, createClient]);

  const waitForConnection = useCallback(async (client: Client): Promise<void> => {
    return new Promise((resolve, reject) => {
      let isResolved = false;
      let cleanup: (() => void) | null = null;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          if (cleanup) cleanup();
          reject(new Error('Connection timeout'));
        }
      }, CONNECTION_TIMEOUT);

      const handleSuccess = () => {
        if (!isResolved) {
          isResolved = true;
          if (cleanup) cleanup();
          connectionRef.current.activeConnections.add(client);
          connectionRef.current.backoffTime = RECONNECT_DELAY;
          connectionRef.current.reconnectAttempts = 0;
          resolve();
        }
      };

      const handleError = (error: any) => {
        if (!isResolved) {
          isResolved = true;
          if (cleanup) cleanup();
          error.handled = true; // Mark error as handled
          reject(error);
        }
      };

      client.once('connected', handleSuccess);
      client.once('disconnected', () => handleError(new Error('Connection closed')));
      client.once('error', handleError);

      // Handle connection errors
      client.connection.on('error', handleError);

      client.connect().catch(handleError);

      cleanup = () => {
        clearTimeout(timeoutId);
        client.removeListener('connected', handleSuccess);
        client.removeListener('disconnected', handleError);
        client.removeListener('error', handleError);
        if (client.connection) {
          client.connection.removeListener('error', handleError);
        }
      };
    });
  }, []);

  const ensureConnection = useCallback(async (client: Client) => {
    if (connectionRef.current.isClosing) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const now = Date.now();
    const timeSinceLastConnect = now - connectionRef.current.lastConnectTime;
    if (timeSinceLastConnect < connectionRef.current.backoffTime) {
      await new Promise(resolve => setTimeout(resolve, connectionRef.current.backoffTime - timeSinceLastConnect));
    }

    if (client.isConnected()) {
      if (connectionRef.current.timeoutId) {
        clearTimeout(connectionRef.current.timeoutId);
      }
      connectionRef.current.timeoutId = setTimeout(() => {
        cleanup(client).catch(console.error);
      }, IDLE_TIMEOUT);
      return;
    }

    try {
      setIsConnecting(true);
      connectionRef.current.lastConnectTime = Date.now();
      let currentClient = client;
      let attempts = 0;
      const maxAttempts = MAINNET_NODES.length * 2;

      while (attempts < maxAttempts) {
        try {
          await waitForConnection(currentClient);
          connectionRef.current.timeoutId = setTimeout(() => {
            cleanup(currentClient).catch(console.error);
          }, IDLE_TIMEOUT);

          setIsConnecting(false);
          return;

        } catch (error: any) {
          attempts++;
          console.error(`Connection attempt ${attempts} failed:`, error);

          if (error.message?.includes('noPermission') || error.message?.includes('connection')) {
            await cleanup(currentClient);
            currentClient = await switchToNextNode(currentClient);
            attempts = Math.max(0, attempts - 1);
          } else if (attempts === maxAttempts) {
            throw error;
          } else {
            const backoffDelay = Math.min(
              connectionRef.current.backoffTime * Math.pow(2, attempts - 1),
              MAX_BACKOFF_DELAY
            );
            console.log(`Retrying in ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
        }
      }

      throw new Error('Failed to connect after maximum attempts');
    } catch (error) {
      await cleanup(client);
      throw error;
    }
  }, [cleanup, waitForConnection, switchToNextNode]);

  const disconnect = useCallback(async (client: Client) => {
    await cleanup(client);
  }, [cleanup]);

  return (
    <XrplContext.Provider value={{ 
      ensureConnection, 
      disconnect, 
      isConnecting,
      currentNode 
    }}>
      {children}
    </XrplContext.Provider>
  );
}; 