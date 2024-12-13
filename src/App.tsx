import React, { useState, useEffect } from 'react';
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

// Define network constants
const MAINNET_URL = 'wss://xrplcluster.com';
const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';

const App: React.FC = () => {
  const [client, setClient] = useState<Client | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('wallet');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('mainnet'); // Default to mainnet
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const hasPassword = localStorage.getItem('walletPassword');
    const storedNetwork = localStorage.getItem('network') || 'mainnet';
    setIsFirstTimeUser(!hasPassword);
    setNetwork(storedNetwork as 'mainnet' | 'testnet');
    
    if (!isFirstTimeUser) {
      initializeWallet(storedNetwork as 'mainnet' | 'testnet');
    } else {
      initializeWallet('mainnet'); // Always start with mainnet for new users
    }
  }, [isFirstTimeUser]);

  const initializeWallet = async (networkType: 'mainnet' | 'testnet') => {
    try {
      setIsConnecting(true);
      
      // Disconnect existing client if any
      if (client) {
        await client.disconnect();
      }

      // Initialize XRPL client based on network
      const newClient = new Client(networkType === 'mainnet' ? MAINNET_URL : TESTNET_URL);
      await newClient.connect();
      setClient(newClient);

      // Get stored wallet data
      const storedWallet = localStorage.getItem('wallet');
      if (storedWallet) {
        setWallet(JSON.parse(storedWallet));
      }
    } catch (error) {
      console.error('Error initializing wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleWalletCreated = (newWallet: any) => {
    setWallet(newWallet);
    localStorage.setItem('wallet', JSON.stringify(newWallet));
    localStorage.setItem('network', 'mainnet'); // Always store mainnet for new wallets
    setIsFirstTimeUser(false);
  };

  const handleNetworkChange = async (newNetwork: 'mainnet' | 'testnet') => {
    setNetwork(newNetwork);
    localStorage.setItem('network', newNetwork);
    await initializeWallet(newNetwork);
  };

  const renderContent = () => {
    // Return early if client is null
    if (!client) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="loading-spinner mb-4"></div>
            <p className="text-muted">Connecting to network...</p>
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
            onNavigate={setActiveTab}
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
            onClose={() => setActiveTab('wallet')}
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
                    onClick={() => setActiveTab('wallet')}
                    className={`flex-1 p-4 text-sm flex flex-col items-center justify-center ${activeTab === 'wallet' ? 'text-primary' : 'text-muted'}`}
                  >
                    <RiWallet3Line className="text-xl mb-1" />
                    <span>Wallet</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('swap')}
                    className={`flex-1 p-4 text-sm flex flex-col items-center justify-center ${activeTab === 'swap' ? 'text-primary' : 'text-muted'}`}
                  >
                    <RiExchangeLine className="text-xl mb-1" />
                    <span>Swap</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('trustlines')}
                    className={`flex-1 p-4 text-sm flex flex-col items-center justify-center ${activeTab === 'trustlines' ? 'text-primary' : 'text-muted'}`}
                  >
                    <RiLinkM className="text-xl mb-1" />
                    <span>Trustlines</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('activity')}
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
