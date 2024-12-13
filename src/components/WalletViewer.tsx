import React, { useState, useEffect } from 'react';
import { Client } from 'xrpl';
import { RiQrCodeLine, RiArrowRightLine, RiSettings4Line } from 'react-icons/ri';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { getTokenInfo, formatCurrency } from '../utils/tokens';
import { useXrpl } from '../contexts/XrplContext';

interface WalletViewerProps {
  wallet: {
    address: string;
    seed: string;
    publicKey: string;
    mnemonic?: string[];
  };
  client: Client;
  onNavigate: (tab: string) => void;
  onNetworkChange: (network: 'mainnet' | 'testnet') => void;
  currentNetwork: 'mainnet' | 'testnet';
}

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

// Custom image component with better error handling
const TokenImage: React.FC<{ src?: string; symbol: string }> = ({ src, symbol }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center">
        <span className="text-sm font-medium">
          {symbol.slice(0, 2).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-surface-light overflow-hidden flex items-center justify-center">
      <img 
        src={src} 
        alt={symbol}
        className="w-8 h-8 object-cover"
        crossOrigin="anonymous"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </div>
  );
};

export const WalletViewer: React.FC<WalletViewerProps> = ({
  wallet,
  client,
  onNavigate,
  onNetworkChange,
  currentNetwork
}) => {
  const { ensureConnection } = useXrpl();
  const [balance, setBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showReceive, setShowReceive] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const maxRetries = 3;

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        await ensureConnection(client);
        await Promise.all([fetchBalance(), fetchAssets()]);
      } catch (err) {
        console.error('Error loading wallet data:', err);
        handleError(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [wallet.address, client]);

  const handleError = (err: any) => {
    console.error('Error:', err);
    if (retryCount < maxRetries) {
      setRetryCount(prev => prev + 1);
      setTimeout(() => {
        fetchBalance();
        fetchAssets();
      }, 2000);
    } else {
      setError('Failed to connect. Please try again later.');
    }
  };

  const fetchBalance = async () => {
    try {
      await ensureConnection(client);
      const response = await client.getXrpBalance(wallet.address);
      setBalance(response);
      setError(null);
    } catch (err) {
      console.error('Error fetching balance:', err);
      handleError(err);
    }
  };

  const fetchAssets = async () => {
    try {
      await ensureConnection(client);
      const response = await client.request({
        command: 'account_lines',
        account: wallet.address,
      });
      
      if (response.result.lines) {
        const formattedAssets = response.result.lines.map((line: any) => {
          const tokenInfo = getTokenInfo(line.account, line.currency);
          return {
            currency: line.currency,
            issuer: line.account,
            balance: parseFloat(line.balance),
            limit: line.limit,
            info: tokenInfo
          };
        });
        setAssets(formattedAssets);
      }
    } catch (err) {
      console.error('Failed to fetch assets:', err);
      handleError(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card bg-gradient-to-br from-surface-light to-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Wallet</h2>
            <p className="text-sm text-muted">Manage your assets</p>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className="btn btn-icon"
          >
            <RiSettings4Line className="text-xl" />
          </button>
        </div>

        {/* Balance Display */}
        <div className="text-center">
          <div className="text-3xl font-bold mb-2">
            {isLoading ? (
              <div className="loading-spinner mx-auto" />
            ) : (
              `${balance} XRP`
            )}
          </div>
          <div className="text-sm text-muted break-all">
            {wallet.address}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setShowReceive(true)}
            className="btn btn-secondary flex-1 py-3"
          >
            <RiQrCodeLine className="text-xl mr-2" />
            Receive
          </button>
          <button
            onClick={() => onNavigate('swap')}
            className="btn btn-primary flex-1 py-3"
          >
            <RiArrowRightLine className="text-xl mr-2" />
            Swap
          </button>
        </div>
      </div>

      {/* Assets List */}
      <div className="card bg-surface p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Assets</h3>
          <button
            onClick={() => onNavigate('trustlines')}
            className="text-sm text-primary"
          >
            Manage
          </button>
        </div>
        <div className="space-y-3">
          {assets.length > 0 ? (
            assets.map((asset, index) => (
              <div
                key={`${asset.currency}-${asset.issuer}-${index}`}
                className="flex items-center justify-between p-3 bg-surface-light rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <TokenImage src={asset.info.icon} symbol={asset.info.symbol} />
                  <div>
                    <div className="font-medium">{asset.info.name}</div>
                    <div className="text-sm text-muted">
                      {asset.info.issuerName}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{asset.balance} {asset.info.symbol}</div>
                  <div className="text-sm text-muted">
                    Limit: {asset.limit}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-muted py-4">
              <p>No assets found</p>
              <button
                onClick={() => onNavigate('trustlines')}
                className="btn btn-secondary mt-2"
              >
                Add Trustline
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-lg">
          <p className="text-sm text-error">{error}</p>
          {retryCount >= maxRetries && (
            <button 
              onClick={() => {
                setRetryCount(0);
                setError(null);
                fetchBalance();
              }}
              className="mt-2 btn btn-secondary btn-sm"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Receive Modal */}
      <AnimatePresence>
        {showReceive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowReceive(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="card bg-surface p-6 space-y-4">
                <h3 className="text-lg font-bold text-center">Receive XRP</h3>
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG
                    value={wallet.address}
                    size={256}
                    className="w-full h-auto"
                    level="H"
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted break-all">
                    {wallet.address}
                  </p>
                </div>
                <button
                  onClick={() => setShowReceive(false)}
                  className="btn btn-secondary w-full py-3"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
