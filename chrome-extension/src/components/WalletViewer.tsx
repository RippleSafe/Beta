import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from 'xrpl';
import { RiQrCodeLine, RiArrowRightLine, RiSettings4Line, RiRefreshLine, RiEyeLine, RiEyeOffLine, RiWifiLine, RiWifiOffLine } from 'react-icons/ri';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { getTokenInfo } from '../utils/tokens';
import { useXrpl } from '../contexts/XrplContext';
import { useWallet } from '../contexts/WalletContext';
import debounce from 'lodash/debounce';

// Chrome storage helper functions
const chromeStorage = {
  get: async (key: string) => {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key]);
      });
    });
  },
  set: async (key: string, value: any) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
};

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

const INITIAL_RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 32000;
const MAX_RETRIES = 3;
const AUTO_REFRESH_INTERVAL = 30000;
const MIN_FETCH_INTERVAL = 10000;

type FetchWalletDataType = (retryCount?: number) => Promise<void>;
type ReconnectType = () => Promise<void>;

export const WalletViewer: React.FC<WalletViewerProps> = ({
  wallet,
  client,
  onNavigate,
  onNetworkChange,
  currentNetwork
}) => {
  const { ensureConnection } = useXrpl();
  const { getCachedBalance, setCachedBalance, getCachedAssets, setCachedAssets } = useWallet();
  const [balance, setBalance] = useState<string>('0');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [isAddressHidden, setIsAddressHidden] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const retryTimeoutRef = useRef<number>();
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);
  const autoRefreshIntervalRef = useRef<number>();
  const reconnectTimeoutRef = useRef<number>();

  // Load cached data from Chrome storage
  useEffect(() => {
    const loadCachedData = async () => {
      const cachedBalance = await chromeStorage.get(`balance_${wallet.address}`);
      const cachedAssets = await chromeStorage.get(`assets_${wallet.address}`);
      
      if (cachedBalance) setBalance(cachedBalance);
      if (cachedAssets) setAssets(cachedAssets);
    };
    
    loadCachedData();
  }, [wallet.address]);

  const handleReconnect = useCallback<ReconnectType>(async () => {
    if (!isMountedRef.current || isLoading) return;

    try {
      await ensureConnection(client);
      await fetchWalletData();
    } catch (err) {
      console.error('Reconnection attempt failed:', err);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (isMountedRef.current) {
          handleReconnect();
        }
      }, INITIAL_RETRY_DELAY);
    }
  }, [client, ensureConnection, isLoading]);

  const fetchWalletData = useCallback<FetchWalletDataType>(async (retryCount = 0) => {
    if (!isMountedRef.current) return;
    
    const now = Date.now();
    if (now - lastFetchRef.current < MIN_FETCH_INTERVAL) {
      return;
    }
    lastFetchRef.current = now;

    try {
      setIsLoading(true);
      setError(null);

      await ensureConnection(client);

      const balanceResponse = await client.getXrpBalance(wallet.address);
      if (!isMountedRef.current) return;
      
      setBalance(balanceResponse);
      await chromeStorage.set(`balance_${wallet.address}`, balanceResponse);

      const assetsResponse = await client.request({
        command: 'account_lines',
        account: wallet.address,
      });
      
      if (!isMountedRef.current) return;

      if (assetsResponse.result.lines) {
        const formattedAssets = assetsResponse.result.lines.map((line: any) => ({
          currency: line.currency,
          issuer: line.account,
          balance: parseFloat(line.balance),
          limit: line.limit,
          info: getTokenInfo(line.account, line.currency)
        }));
        setAssets(formattedAssets);
        await chromeStorage.set(`assets_${wallet.address}`, formattedAssets);
      }

      setIsConnected(true);
      setError(null);
    } catch (err: any) {
      if (!isMountedRef.current) return;

      console.error('Failed to fetch wallet data:', err);
      setError(err?.message || 'Failed to connect to network');
      setIsConnected(false);

      if (retryCount < MAX_RETRIES) {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY);
        retryTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) {
            fetchWalletData(retryCount + 1);
          }
        }, delay);
      } else {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) {
            handleReconnect();
          }
        }, INITIAL_RETRY_DELAY);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [client, wallet.address, ensureConnection]);

  const debouncedFetchWalletData = useCallback(
    debounce(() => fetchWalletData(), 1000, { leading: true, trailing: false }),
    [fetchWalletData]
  );

  const handleRefresh = useCallback(() => {
    if (isLoading) return;
    debouncedFetchWalletData();
  }, [debouncedFetchWalletData, isLoading]);

  useEffect(() => {
    isMountedRef.current = true;
    
    autoRefreshIntervalRef.current = window.setInterval(() => {
      if (isMountedRef.current && !isLoading) {
        debouncedFetchWalletData();
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      isMountedRef.current = false;
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
      if (autoRefreshIntervalRef.current) {
        window.clearInterval(autoRefreshIntervalRef.current);
      }
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [debouncedFetchWalletData, isLoading]);

  useEffect(() => {
    const initializeWallet = async () => {
      try {
        await ensureConnection(client);
        await fetchWalletData();
      } catch (err: any) {
        if (isMountedRef.current) {
          console.error('Initial connection failed:', err);
          setError(err?.message || 'Failed to connect to network');
          setIsConnected(false);
        }
      }
    };

    initializeWallet();
  }, [client, ensureConnection, fetchWalletData]);

  // Extension-specific styles
  const containerStyle = {
    width: '360px',
    maxHeight: '600px',
    overflow: 'auto'
  };

  return (
    <div className="space-y-6" style={containerStyle}>
      {/* Header */}
      <div className="card bg-gradient-to-br from-surface-light to-surface p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <img 
              src="/icons/icon48.png"
              alt="RippleSafe"
              className="w-12 h-12"
            />
            <div>
              <h2 className="text-lg font-bold">RippleSafe</h2>
              <div className="flex items-center mt-2 space-x-2">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="btn btn-icon btn-sm"
                  title={isLoading ? "Refreshing..." : "Refresh wallet data"}
                >
                  <RiRefreshLine className={`text-lg ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => onNavigate('settings')}
                  className="btn btn-icon btn-sm"
                >
                  <RiSettings4Line className="text-lg" />
                </button>
                <div className="text-sm ml-2" title={isConnected ? "Connected to network" : "Not connected"}>
                  {isConnected ? (
                    <RiWifiLine className="text-green-500" />
                  ) : (
                    <RiWifiOffLine className="text-red-500" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Balance Display */}
        <div className="text-center">
          {error ? (
            <div className="text-red-500 text-sm mb-2">{error}</div>
          ) : null}
          <div className="text-2xl font-bold mb-2">
            {isLoading ? (
              <div className="loading-spinner mx-auto" />
            ) : (
              `${balance} XRP`
            )}
          </div>
          <div className="text-sm text-muted break-all">
            {isAddressHidden 
              ? '••••••••••••••••••••••••••••••••••'
              : wallet.address
            }
            <button
              onClick={() => setIsAddressHidden(!isAddressHidden)}
              className="btn btn-icon btn-sm ml-2"
              title={isAddressHidden ? "Show address" : "Hide address"}
            >
              {isAddressHidden ? <RiEyeLine /> : <RiEyeOffLine />}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setShowReceive(true)}
            className="btn btn-secondary flex-1 py-2 text-sm"
          >
            <RiQrCodeLine className="text-lg mr-1" />
            Receive
          </button>
          <button
            onClick={() => onNavigate('swap')}
            className="btn btn-primary flex-1 py-2 text-sm"
          >
            <RiArrowRightLine className="text-lg mr-1" />
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
        <div className="space-y-2 max-h-[200px] overflow-auto">
          {assets.length > 0 ? (
            assets.map((asset, index) => (
              <div
                key={`${asset.currency}-${asset.issuer}-${index}`}
                className="flex items-center justify-between p-2 bg-surface-light rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-surface-light flex items-center justify-center overflow-hidden">
                    {asset.currency ? (
                      <img
                        src={`https://dd.dexscreener.com/ds-data/tokens/xrpl/${asset.currency.toLowerCase()}.${asset.issuer.toLowerCase()}.png?size=lg&key=825b1a`}
                        alt={asset.info.symbol}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const span = document.createElement('span');
                            span.className = 'text-xs font-medium';
                            span.textContent = asset.info.symbol.slice(0, 2).toUpperCase();
                            parent.appendChild(span);
                          }
                        }}
                      />
                    ) : (
                      <span className="text-xs font-medium">
                        {asset.info.symbol.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{asset.info.name}</div>
                    <div className="text-xs text-muted">
                      {asset.info.issuerName}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-sm">{asset.balance} {asset.info.symbol}</div>
                  <div className="text-xs text-muted">
                    Limit: {asset.limit}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-muted py-4">
              <p className="text-sm">No assets found</p>
              <button
                onClick={() => onNavigate('trustlines')}
                className="btn btn-secondary btn-sm mt-2"
              >
                Add Trustline
              </button>
            </div>
          )}
        </div>
      </div>

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
              className="w-full max-w-[280px]"
              onClick={e => e.stopPropagation()}
            >
              <div className="card bg-surface p-4 space-y-4">
                <h3 className="text-lg font-bold text-center">Receive XRP</h3>
                <div className="bg-white p-3 rounded-lg">
                  <QRCodeSVG
                    value={wallet.address}
                    size={200}
                    className="w-full h-auto"
                    level="H"
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted break-all">
                    {wallet.address}
                  </p>
                </div>
                <button
                  onClick={() => setShowReceive(false)}
                  className="btn btn-secondary w-full py-2 text-sm"
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