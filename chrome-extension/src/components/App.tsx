import React, { useState } from 'react';
import { XrplProvider } from '../contexts/XrplContext';
import { WalletProvider } from '../contexts/WalletContext';
import { WalletViewer } from './WalletViewer';
import { Client } from 'xrpl';

const App: React.FC = () => {
  const [currentNetwork, setCurrentNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [currentTab, setCurrentTab] = useState('wallet');
  
  // Initialize XRPL client
  const client = new Client(
    currentNetwork === 'mainnet' 
      ? 'wss://s1.ripple.com' 
      : 'wss://s.altnet.rippletest.net:51233'
  );

  // Mock wallet data for testing - replace with actual wallet management
  const wallet = {
    address: 'rDjibd7jJ6wrGa6vvDf7rCVsjbPJdGnm6g',
    seed: 'your_seed_here',
    publicKey: 'your_public_key_here'
  };

  return (
    <XrplProvider>
      <WalletProvider>
        <div className="min-w-[360px] min-h-[600px] bg-background text-foreground">
          <WalletViewer
            wallet={wallet}
            client={client}
            onNavigate={setCurrentTab}
            onNetworkChange={setCurrentNetwork}
            currentNetwork={currentNetwork}
          />
        </div>
      </WalletProvider>
    </XrplProvider>
  );
};

export default App; 