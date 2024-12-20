import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from 'xrpl';
import { WalletViewer } from './components/WalletViewer';
import { TokenSwap } from './components/TokenSwap';
import { TrustlineManager } from './components/TrustlineManager';
import { Activity } from './components/Activity';
import { Settings } from './components/Settings';
import { WalletCreator } from './components/WalletCreator';
import { RiWallet3Line, RiExchangeLine, RiLinkM, RiHistoryLine } from 'react-icons/ri';
import { XrplProvider } from './contexts/XrplContext';
import { WalletProvider } from './contexts/WalletContext';
import debounce from 'lodash/debounce';

// Define network constants
const MAINNET_URL = 'wss://xrplcluster.com';
const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 10000;

const App: React.FC = () => {
  const [client, setClient] = useState<Client | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('wallet');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const retryTimeout = useRef<NodeJS.Timeout>();
  const isReconnecting = useRef(false);

  useEffect(() => {
    const hasPassword = localStorage.getItem('walletPassword');
    const storedNetwork = localStorage.getItem('network') || 'mainnet';
    const storedWallet = localStorage.getItem('wallet');
    
    console.log('Initial load - stored wallet exists:', !!storedWallet);
    
    if (storedWallet) {
      try {
        const parsedWallet = JSON.parse(storedWallet);
        // Validate wallet structure
        if (!parsedWallet.address || !parsedWallet.publicKey || !parsedWallet.seed) {
          console.error('Invalid wallet structure:', {
            hasAddress: !!parsedWallet.address,
            hasPublicKey: !!parsedWallet.publicKey,
            hasSeed: !!parsedWallet.seed
          });
          throw new Error('Invalid wallet structure');
        }
        
        console.log('Wallet parsed successfully:', {
          address: parsedWallet.address,
          hasPublicKey: !!parsedWallet.publicKey,
          hasSeed: !!parsedWallet.seed
        });
        
        // Ensure we have the complete wallet data
        const existingWallet = JSON.parse(localStorage.getItem('wallet') || '{}');
        const completeWallet = {
          ...existingWallet,
          ...parsedWallet,
          // Ensure we keep the seed if it exists
          seed: parsedWallet.seed || existingWallet.seed
        };
        
        setWallet(completeWallet);
        // Save the complete wallet back to localStorage
        localStorage.setItem('wallet', JSON.stringify(completeWallet));
        setIsFirstTimeUser(false);
      } catch (error: unknown) {
        console.error('Error parsing stored wallet:', error);
        if (error instanceof Error) {
          console.error('Error details:', error.message);
        }
        localStorage.removeItem('wallet');
        setIsFirstTimeUser(true);
      }
    } else {
      console.log('No stored wallet found');
      setIsFirstTimeUser(true);
    }
    
    setNetwork(storedNetwork as 'mainnet' | 'testnet');
    console.log('Network set to:', storedNetwork);
    initializeWallet(storedNetwork as 'mainnet' | 'testnet');

    return () => {
      cleanupConnection();
    };
  }, []);

  const cleanupConnection = () => {
    if (retryTimeout.current) {
      clearTimeout(retryTimeout.current);
    }
    if (client) {
      client.removeAllListeners();
      client.disconnect();
    }
    retryCount.current = 0;
    isReconnecting.current = false;
  };

  const initializeWallet = async (networkType: 'mainnet' | 'testnet') => {
    try {
      if (isReconnecting.current) {
        console.log('Already attempting to reconnect, skipping...');
        return;
      }

      console.log('Initializing wallet for network:', networkType);
      setIsConnecting(true);
      setConnectionError(null);
      
      cleanupConnection();

      // Initialize XRPL client based on network
      const newClient = new Client(networkType === 'mainnet' ? MAINNET_URL : TESTNET_URL);
      console.log('XRPL client created for URL:', networkType === 'mainnet' ? MAINNET_URL : TESTNET_URL);
      
      // Add connection event listeners
      newClient.on('disconnected', () => {
        console.log('Disconnected from node, attempting reconnection...');
        handleReconnect(networkType);
      });

      await newClient.connect();
      console.log('Successfully connected to', networkType);
      setClient(newClient);
      retryCount.current = 0;

      // Get stored wallet data if not already loaded
      if (!wallet) {
        console.log('No wallet in state, checking localStorage');
        const storedWallet = localStorage.getItem('wallet');
        if (storedWallet) {
          try {
            const parsedWallet = JSON.parse(storedWallet);
            console.log('Found wallet in localStorage:', {
              address: parsedWallet.address,
              hasPublicKey: !!parsedWallet.publicKey,
              hasSeed: !!parsedWallet.seed
            });
            setWallet(parsedWallet);
          } catch (error: unknown) {
            console.error('Error parsing stored wallet:', error);
            if (error instanceof Error) {
              console.error('Error details:', error.message);
            }
          }
        } else {
          console.log('No wallet found in localStorage');
        }
      } else {
        console.log('Wallet already loaded in state:', {
          address: wallet.address,
          hasPublicKey: !!wallet.publicKey,
          hasSeed: !!wallet.seed
        });
      }
    } catch (error: unknown) {
      console.error('Error initializing wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 
                         typeof error === 'object' && error && 'message' in error ? (error as { message: string }).message :
                         String(error);
      
      if (errorMessage.includes('IP limit reached')) {
        setConnectionError('Connection limit reached. Please wait a moment before trying again.');
        // Implement exponential backoff
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, retryCount.current), MAX_RETRY_DELAY);
        console.log(`Retrying in ${delay}ms...`);
        retryTimeout.current = setTimeout(() => {
          retryCount.current++;
          if (retryCount.current <= MAX_RETRY_ATTEMPTS) {
            initializeWallet(networkType);
          } else {
            setConnectionError('Unable to connect after multiple attempts. Please try again later.');
          }
        }, delay);
      } else {
        setConnectionError('Failed to connect to network. Please try again.');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReconnect = debounce(async (networkType: 'mainnet' | 'testnet') => {
    if (isReconnecting.current) {
      console.log('Already attempting to reconnect, skipping...');
      return;
    }
    isReconnecting.current = true;
    await initializeWallet(networkType);
  }, 5000, { leading: true, trailing: false });

  const handleWalletCreated = (newWallet: any) => {
    try {
      // Validate wallet structure
      if (!newWallet.address || !newWallet.publicKey || !newWallet.seed) {
        console.error('Invalid new wallet structure:', {
          hasAddress: !!newWallet.address,
          hasPublicKey: !!newWallet.publicKey,
          hasSeed: !!newWallet.seed
        });
        throw new Error('Invalid wallet structure');
      }

      console.log('Creating new wallet:', {
        address: newWallet.address,
        hasPublicKey: !!newWallet.publicKey,
        hasSeed: !!newWallet.seed
      });
      
      // Ensure we have all required wallet data
      const walletData = {
        address: newWallet.address,
        publicKey: newWallet.publicKey,
        seed: newWallet.seed,
        mnemonic: newWallet.mnemonic
      };
      
      setWallet(walletData);
      localStorage.setItem('wallet', JSON.stringify(walletData));
      localStorage.setItem('network', 'mainnet');
      
      console.log('Wallet saved to localStorage');
      setIsFirstTimeUser(false);
    } catch (error: unknown) {
      console.error('Error saving wallet:', error);
      // Don't try to save incomplete wallet data
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string'
          ? error
          : 'Unknown error';
      throw new Error('Failed to save wallet: ' + errorMessage);
    }
  };

  const handleNetworkChange = async (newNetwork: 'mainnet' | 'testnet') => {
    setNetwork(newNetwork);
    localStorage.setItem('network', newNetwork);
    await initializeWallet(newNetwork);
  };

  // Debounce tab changes to prevent rapid reconnections
  const handleTabChange = debounce((tab: string) => {
    if (tab === activeTab) return; // Skip if same tab
    setActiveTab(tab);
  }, 1000, { leading: true, trailing: false });

  const renderContent = () => {
    if (!client) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="loading-spinner mb-4"></div>
            <p className="text-muted">Connecting to network...</p>
            {connectionError && (
              <p className="text-error mt-2">{connectionError}</p>
            )}
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'wallet':
        return (
          <WalletViewer 
            wallet={wallet} 
            client={client} 
            onNavigate={handleTabChange}
            onNetworkChange={handleNetworkChange}
            currentNetwork={network}
          />
        );
      case 'swap':
        return <TokenSwap wallet={wallet} client={client} />;
      case 'trustlines':
        return <TrustlineManager wallet={wallet} client={client} />;
      case 'activity':
        return <Activity wallet={wallet} client={client} currentNetwork={network} />;
      case 'settings':
        return (
          <Settings
            wallet={wallet}
            onNetworkChange={handleNetworkChange}
            currentNetwork={network}
            onClose={() => handleTabChange('wallet')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <XrplProvider>
      <WalletProvider>
        {isFirstTimeUser ? (
          client ? (
            <WalletCreator
              client={client}
              onWalletCreated={handleWalletCreated}
            />
          ) : (
            <div className="flex items-center justify-center h-screen">
              <div className="text-center">
                <div className="loading-spinner mb-4"></div>
                <p className="text-muted">Connecting to Mainnet...</p>
              </div>
            </div>
          )
        ) : !client || !wallet || isConnecting ? (
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="loading-spinner mb-4"></div>
              <p className="text-muted">
                {isConnecting ? `Connecting to ${network === 'mainnet' ? 'Mainnet' : 'Testnet'}...` : 'Loading wallet...'}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-screen bg-background text-foreground">
            {network === 'testnet' && (
              <div className="bg-warning/10 text-warning px-4 py-2 text-center text-sm">
                ⚠️ You are currently on Testnet. Switch to Mainnet for real transactions.
              </div>
            )}
            <div className="container mx-auto max-w-lg p-4 pb-24">
              {renderContent()}
            </div>

            {/* Bottom Navigation */}
            <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-surface-light">
              <div className="container mx-auto max-w-lg">
                <div className="flex justify-around">
                  <button
                    onClick={() => handleTabChange('wallet')}
                    className={`flex-1 p-4 text-sm flex flex-col items-center justify-center ${activeTab === 'wallet' ? 'text-primary' : 'text-muted'}`}
                  >
                    <RiWallet3Line className="text-xl mb-1" />
                    <span>Wallet</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('swap')}
                    className={`flex-1 p-4 text-sm flex flex-col items-center justify-center ${activeTab === 'swap' ? 'text-primary' : 'text-muted'}`}
                  >
                    <RiExchangeLine className="text-xl mb-1" />
                    <span>Swap</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('trustlines')}
                    className={`flex-1 p-4 text-sm flex flex-col items-center justify-center ${activeTab === 'trustlines' ? 'text-primary' : 'text-muted'}`}
                  >
                    <RiLinkM className="text-xl mb-1" />
                    <span>Trustlines</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('activity')}
                    className={`flex-1 p-4 text-sm flex flex-col items-center justify-center ${activeTab === 'activity' ? 'text-primary' : 'text-muted'}`}
                  >
                    <RiHistoryLine className="text-xl mb-1" />
                    <span>Activity</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </WalletProvider>
    </XrplProvider>
  );
};

export default App;
