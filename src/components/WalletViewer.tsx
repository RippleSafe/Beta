import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from 'xrpl';
import { RiQrCodeLine, RiArrowRightLine, RiSettings4Line, RiRefreshLine, RiEyeLine, RiEyeOffLine, RiWifiLine, RiWifiOffLine } from 'react-icons/ri';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { getTokenInfo } from '../utils/tokens';
import { useXrpl } from '../contexts/XrplContext';
import { useWallet } from '../contexts/WalletContext';
import debounce from 'lodash/debounce';

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
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds
const MIN_FETCH_INTERVAL = 10000; // 10 seconds

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
  const [balance, setBalance] = useState<string>(getCachedBalance(wallet.address) || '0');
  const [assets, setAssets] = useState<Asset[]>(getCachedAssets(wallet.address) || []);
  const [isLoading, setIsLoading] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [isAddressHidden, setIsAddressHidden] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout>();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const handleReconnect = useCallback<ReconnectType>(async () => {
    if (!isMountedRef.current || isLoading) return;

    try {
      await ensureConnection(client);
      await fetchWalletData();
    } catch (err) {
      console.error('Reconnection attempt failed:', err);
      // Schedule next reconnection attempt
      reconnectTimeoutRef.current = setTimeout(() => {
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
      setCachedBalance(wallet.address, balanceResponse);

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
        setCachedAssets(wallet.address, formattedAssets);
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
        retryTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            fetchWalletData(retryCount + 1);
          }
        }, delay);
      } else {
        reconnectTimeoutRef.current = setTimeout(() => {
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
  }, [client, wallet.address, setCachedBalance, setCachedAssets, ensureConnection]);

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
    
    autoRefreshIntervalRef.current = setInterval(() => {
      if (isMountedRef.current && !isLoading) {
        debouncedFetchWalletData();
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      isMountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card bg-gradient-to-br from-surface-light to-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-6">
            <img 
              src="/RippleSafeLogo/vector/icon.svg"
              alt="RippleSafe"
              className="w-16 h-16"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null;
                target.src = "/RippleSafeLogo/default.png";
              }}
            />
            <div>
              <h2 className="text-xl font-bold">RippleSafe</h2>
              <div className="flex items-center mt-2 space-x-2">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="btn btn-icon"
                  title={isLoading ? "Refreshing..." : "Refresh wallet data"}
                >
                  <RiRefreshLine className={`text-xl ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => onNavigate('settings')}
                  className="btn btn-icon"
                >
                  <RiSettings4Line className="text-xl" />
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
          <div className="text-3xl font-bold mb-2">
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
                  <div className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center overflow-hidden">
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
                            span.className = 'text-sm font-medium';
                            span.textContent = asset.info.symbol.slice(0, 2).toUpperCase();
                            parent.appendChild(span);
                          }
                        }}
                      />
                    ) : (
                      <span className="text-sm font-medium">
                        {asset.info.symbol.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
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
