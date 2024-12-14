import React, { useState, useEffect } from 'react';
import { Client } from 'xrpl';
import { getTrustlines, setupTrustline, revokeTrustline, Trustline, getBalance } from '../utils/xrpl';
import { RiAddLine, RiCloseLine, RiErrorWarningLine, RiSettings4Line, RiCheckLine, RiDeleteBinLine, RiRefreshLine } from 'react-icons/ri';
import { motion, AnimatePresence } from 'framer-motion';
import { useXrpl } from '../contexts/XrplContext';
import { useWallet } from '../contexts/WalletContext';
import { Wallet } from 'xrpl';

interface TrustlineManagerProps {
  wallet: {
    address: string;
    seed: string;
    publicKey: string;
  };
  client: Client;
}

interface RevokeTrustlineData {
  currency: string;
  issuer: string;
  balance: string;
}

interface TokenInfo {
  logoUrl: string | null;
  name: string | null;
  symbol: string;
}

export const TrustlineManager: React.FC<TrustlineManagerProps> = ({ wallet, client }) => {
  const { ensureConnection } = useXrpl();
  const { getCachedAssets, setCachedAssets } = useWallet();
  const [trustlines, setTrustlines] = useState<Trustline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addedTokens, setAddedTokens] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'trustlines' | 'popular'>('trustlines');
  const [isAccountActivated, setIsAccountActivated] = useState(true);
  const [balance, setBalance] = useState('0');
  const [customInput, setCustomInput] = useState('');
  const [showCustomLimit, setShowCustomLimit] = useState(false);
  const [customLimit, setCustomLimit] = useState('1000000000');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [showRevokeConfirmation, setShowRevokeConfirmation] = useState(false);
  const [revokeData, setRevokeData] = useState<RevokeTrustlineData | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [tokenInfoCache, setTokenInfoCache] = useState<Record<string, TokenInfo>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showFinalWarning, setShowFinalWarning] = useState(false);

  // Example popular tokens (common stablecoins)
  const popularTokens = [
    {
      currency: 'USD',
      issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
      issuerName: 'GateHub',
      name: 'US Dollar'
    },
    {
      currency: 'EUR',
      issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
      issuerName: 'GateHub',
      name: 'Euro'
    }
  ];

  useEffect(() => {
    // Load cached data first
    const cachedAssets = getCachedAssets(wallet.address);
    if (cachedAssets) {
      setTrustlines(formatAssetsToTrustlines(cachedAssets));
      setIsLoading(false);
    }
    
    // Only check account status if no cached data
    if (!cachedAssets) {
      checkAccountStatus();
    }
  }, [wallet.address]);

  const checkAccountStatus = async () => {
    try {
      setIsLoading(true);
      await ensureConnection(client);
      const accountBalance = await getBalance(client, wallet.address, ensureConnection);
      setBalance(accountBalance);
      setIsAccountActivated(true);
      
      await fetchTrustlines();
      
      if (isRefreshing) {
        setShowRefreshSuccess(true);
        setTimeout(() => setShowRefreshSuccess(false), 2000);
        setIsRefreshing(false);
      }
    } catch (err: any) {
      if (err.message?.includes('Account not found')) {
        setIsAccountActivated(false);
        setError('Account needs to be activated with a minimum of 2 XRP');
      } else {
        console.error('Error checking account status:', err);
        setError('Failed to check account status');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatAssetsToTrustlines = (assets: any[]): Trustline[] => {
    return assets.map(asset => ({
      currency: asset.currency,
      account: asset.issuer,
      balance: asset.balance.toString(),
      limit: asset.limit || '0',
      limit_peer: '0',
      quality_in: 0,
      quality_out: 0
    }));
  };

  const fetchTrustlines = async () => {
    if (!isAccountActivated) return;
    
    try {
      const lines = await getTrustlines(client, wallet.address, ensureConnection);
      setTrustlines(lines);
      setCachedAssets(wallet.address, lines.map(line => ({
        currency: line.currency,
        issuer: line.account,
        balance: line.balance,
        limit: line.limit,
        info: {
          name: line.currency,
          symbol: line.currency,
          issuerName: line.account
        }
      })));
      const added = new Set<string>(lines.map((line: Trustline) => `${line.currency}:${line.account}`));
      setAddedTokens(added);
    } catch (err) {
      console.error('Error fetching trustlines:', err);
      if (isAccountActivated) {
        setError('Failed to fetch trustlines');
      }
    }
  };

  const parseCustomInput = (input: string): { currency: string; issuer: string } => {
    input = input.trim();

    if (input.includes('.')) {
      const [currencyPart, issuer] = input.split('.');
      
      if (/^[0-9A-F]{40}$/i.test(currencyPart)) {
        return { currency: currencyPart.toUpperCase(), issuer };
      }

      return { currency: currencyPart.toUpperCase(), issuer };
    }

    return { currency: 'USD', issuer: input };
  };

  const formatCurrencyDisplay = (currency: string): string => {
    if (/^[0-9A-F]{40}$/i.test(currency)) {
      try {
        const bytes = Buffer.from(currency, 'hex');
        const ascii = bytes.toString('ascii').replace(/\0/g, '');
        if (/^[A-Za-z0-9]+$/.test(ascii)) {
          return ascii;
        }
      } catch (e) {
        // Fall back to hex
      }
    }
    return currency;
  };

  const handleSetTrustline = async (currency: string, issuer: string) => {
    if (!isAccountActivated) {
      setError('Please activate your account with a minimum of 2 XRP first');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await setupTrustline(client, wallet, currency, issuer, '1000000000', ensureConnection);
      setSuccess(`Successfully added ${currency} trustline`);
      await fetchTrustlines();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error setting trustline:', err);
      if (err.message?.includes('Account not found')) {
        setError('Account needs to be activated with a minimum of 2 XRP');
      } else {
        setError('Failed to set trustline. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomTrustline = async () => {
    if (!isAccountActivated) {
      setError('Please activate your account with a minimum of 2 XRP first');
      return;
    }

    try {
      const { currency, issuer } = parseCustomInput(customInput.trim());

      if (!issuer.match(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/)) {
        setError('Please enter a valid issuer address');
        return;
      }

      setIsAddingCustom(true);
      setError(null);
      await setupTrustline(client, wallet, currency, issuer, customLimit, ensureConnection);
      setSuccess(`Successfully added ${currency} trustline`);
      await fetchTrustlines();
      setCustomInput('');
      setShowCustomLimit(false);
      setCustomLimit('1000000000');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error setting custom trustline:', err);
      setError(err.message || 'Failed to set trustline. Please try again.');
    } finally {
      setIsAddingCustom(false);
    }
  };

  const handleRevokeTrustline = (line: Trustline) => {
    setRevokeData({
      currency: line.currency,
      issuer: line.account,
      balance: line.balance
    });
    setShowRevokeConfirmation(true);
  };

  const confirmRevokeTrustline = async () => {
    if (!revokeData) return;

    // Check password if there are tokens to burn
    if (Number(revokeData.balance) > 0) {
      if (!password) {
        setPasswordError('Please enter your password to confirm token burning');
        return;
      }
      
      try {
        // Verify the password by attempting to create a wallet
        Wallet.fromSeed(password);
        if (password !== wallet.seed) {
          setPasswordError('Incorrect password');
          return;
        }
        // Show final warning before proceeding
        setShowFinalWarning(true);
        return;
      } catch (err) {
        setPasswordError('Invalid password format');
        return;
      }
    }

    // If no tokens to burn, proceed with removal
    await executeTrustlineRemoval();
  };

  const executeTrustlineRemoval = async () => {
    if (!revokeData) return;

    try {
      setIsRevoking(true);
      setError(null);
      await revokeTrustline(client, wallet, revokeData.currency, revokeData.issuer, ensureConnection);
      
      // Reset states
      setPassword('');
      setPasswordError(null);
      setShowFinalWarning(false);
      
      // Verify the trustline is gone and balance is updated
      const [newBalance, newTrustlines] = await Promise.all([
        getBalance(client, wallet.address, ensureConnection),
        getTrustlines(client, wallet.address, ensureConnection)
      ]);

      const trustlineStillExists = newTrustlines.some(line => 
        line.currency === revokeData.currency && 
        line.account === revokeData.issuer && 
        Number(line.limit) > 0
      );

      if (trustlineStillExists) {
        setError('Failed to fully remove trustline. Please try again.');
      } else {
        setSuccess(`Successfully removed ${revokeData.currency} trustline and returned reserve`);
        setBalance(newBalance);
        setTrustlines(newTrustlines);
      }

      setShowRevokeConfirmation(false);
      setRevokeData(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error revoking trustline:', err);
      setError(err.message || 'Failed to revoke trustline. Please try again.');
    } finally {
      setIsRevoking(false);
    }
  };

  const fetchTokenInfo = async (currency: string, issuer: string): Promise<TokenInfo> => {
    const cacheKey = `${currency}:${issuer}`;
    
    console.log(`[TokenInfo] Fetching info for ${currency}:${issuer}`);
    
    // Check cache first
    if (tokenInfoCache[cacheKey]) {
      console.log(`[TokenInfo] Found in cache:`, tokenInfoCache[cacheKey]);
      return tokenInfoCache[cacheKey];
    }

    // Decode hex currency if needed
    let decodedCurrency = currency;
    if (/^[0-9A-F]{40}$/i.test(currency)) {
      try {
        const bytes = Buffer.from(currency, 'hex');
        const ascii = bytes.toString('ascii').replace(/\0/g, '');
        if (/^[A-Za-z0-9]+$/.test(ascii)) {
          decodedCurrency = ascii;
          console.log(`[TokenInfo] Decoded currency from ${currency} to ${decodedCurrency}`);
        }
      } catch (e) {
        console.warn('[TokenInfo] Failed to decode hex currency:', e);
      }
    }

    try {
      // Use DexScreener's direct image URL
      const dexScreenerUrl = `https://dd.dexscreener.com/ds-data/tokens/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}.png?size=lg&key=825b1a`;
      console.log(`[TokenInfo] Using DexScreener URL: ${dexScreenerUrl}`);
      
      const tokenInfo: TokenInfo = {
        logoUrl: dexScreenerUrl,
        name: decodedCurrency,
        symbol: decodedCurrency
      };

      // Update cache
      setTokenInfoCache(prev => {
        const newCache = {
          ...prev,
          [cacheKey]: tokenInfo
        };
        console.log(`[TokenInfo] Updated cache:`, newCache);
        return newCache;
      });

      return tokenInfo;

    } catch (err) {
      console.warn('[TokenInfo] Failed to fetch token info:', err);
    }

    // Return default if no data found
    const defaultInfo = {
      logoUrl: null,
      name: decodedCurrency,
      symbol: decodedCurrency
    };
    console.log(`[TokenInfo] Using default info:`, defaultInfo);
    
    // Update cache even for default info to prevent repeated failed attempts
    setTokenInfoCache(prev => ({
      ...prev,
      [cacheKey]: defaultInfo
    }));
    
    return defaultInfo;
  };

  // Custom image component with better error handling
  const TokenImage: React.FC<{ src: string; symbol: string }> = ({ src, symbol }) => {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
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
          onError={(e) => {
            console.log(`[TokenInfo] Failed to load image for ${symbol}`);
            setHasError(true);
          }}
        />
      </div>
    );
  };

  useEffect(() => {
    const fetchAllTokenInfo = async () => {
      console.log('[TokenInfo] Starting to fetch all token info');
      console.log('[TokenInfo] Current trustlines:', trustlines);
      
      for (const line of trustlines) {
        console.log(`[TokenInfo] Processing trustline:`, line);
        const info = await fetchTokenInfo(line.currency, line.account);
        console.log(`[TokenInfo] Fetched info for ${line.currency}:`, info);
      }
      
      console.log('[TokenInfo] Finished fetching all token info');
      console.log('[TokenInfo] Final cache state:', tokenInfoCache);
    };

    if (trustlines.length > 0) {
      fetchAllTokenInfo();
    }
  }, [trustlines]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    checkAccountStatus();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card bg-gradient-to-br from-surface-light to-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Trustlines</h2>
            <p className="text-sm text-muted">Manage your token trustlines</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="btn btn-icon"
              title="Refresh trustlines"
            >
              <RiRefreshLine className={`text-xl ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Success Popup */}
        {showRefreshSuccess && (
          <div className="fixed top-4 right-4 z-50">
            <div className="card bg-success/10 text-success p-4">
              <div className="flex items-center space-x-2">
                <span>Trustlines updated!</span>
              </div>
            </div>
          </div>
        )}

        {/* Account Activation Warning */}
        {!isAccountActivated && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card bg-warning/10 border border-warning/20 p-4"
          >
            <div className="flex items-start space-x-3">
              <RiErrorWarningLine className="text-warning text-xl flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-warning">Account Not Activated</h3>
                <p className="text-sm text-warning/80 mt-1">
                  Your account needs to be activated with a minimum of 2 XRP before you can add trustlines.
                  Current balance: {balance} XRP
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="card p-2">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('trustlines')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'trustlines'
                  ? 'bg-surface-light text-primary'
                  : 'hover:bg-surface-light/50'
              }`}
            >
              My Trustlines
            </button>
            <button
              onClick={() => setActiveTab('popular')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'popular'
                  ? 'bg-surface-light text-primary'
                  : 'hover:bg-surface-light/50'
              }`}
            >
              Popular Tokens
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          {activeTab === 'trustlines' && (
            <>
              {/* Add Custom Trustline */}
              <div className="card p-4 space-y-4">
                <h3 className="font-medium">Add Custom Trustline</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-muted mb-2">Token Details</label>
                    <input
                      type="text"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="Enter currency.issuer or just issuer for USD"
                      className="input w-full font-mono"
                    />
                    <p className="text-sm text-muted mt-1">
                      Examples:
                      <br />
                      • r... (defaults to USD)
                      <br />
                      • CURRENCY.r...
                      <br />
                      • [hex].r...
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowCustomLimit(!showCustomLimit)}
                      className="btn btn-secondary text-sm"
                    >
                      {showCustomLimit ? 'Use Default Limit' : 'Custom Limit'}
                    </button>
                    <button
                      onClick={handleCustomTrustline}
                      disabled={!customInput || isAddingCustom}
                      className="btn btn-primary"
                    >
                      {isAddingCustom ? (
                        <div className="loading-spinner w-4 h-4 border-white/20 border-t-white" />
                      ) : (
                        'Add Trustline'
                      )}
                    </button>
                  </div>
                  {showCustomLimit && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="block text-sm text-muted mb-2">Custom Limit</label>
                      <input
                        type="number"
                        value={customLimit}
                        onChange={(e) => setCustomLimit(e.target.value)}
                        placeholder="Enter custom limit"
                        className="input w-full"
                        min="0"
                      />
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Existing Trustlines */}
              <div className="card">
                <div className="p-4 border-b border-surface-light">
                  <h3 className="font-medium">My Trustlines</h3>
                </div>
                {isLoading ? (
                  <div className="p-8">
                    <div className="flex flex-col items-center justify-center text-muted">
                      <div className="loading-spinner mb-4" />
                      <p>Loading trustlines...</p>
                    </div>
                  </div>
                ) : trustlines.length > 0 ? (
                  trustlines.map((line) => {
                    const tokenInfo = tokenInfoCache[`${line.currency}:${line.account}`] || {
                      logoUrl: null,
                      name: formatCurrencyDisplay(line.currency),
                      symbol: formatCurrencyDisplay(line.currency)
                    };

                    return (
                      <div
                        key={`${line.currency}:${line.account}`}
                        className="p-4 hover:bg-surface-light/50 transition-colors border-b border-surface-light last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {tokenInfo.logoUrl ? (
                              <TokenImage src={tokenInfo.logoUrl} symbol={tokenInfo.symbol} />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center">
                                <span className="text-sm font-medium">
                                  {tokenInfo.symbol.slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">
                                  {tokenInfo.name || formatCurrencyDisplay(line.currency)}
                                </h3>
                                <button
                                  onClick={() => handleRevokeTrustline(line)}
                                  className="btn btn-icon btn-sm text-error hover:bg-error/10 disabled:opacity-50"
                                  title={Number(line.balance) > 0 ? 'Click to burn tokens and remove trustline' : 'Remove Trustline'}
                                >
                                  <RiDeleteBinLine className="text-lg" />
                                </button>
                              </div>
                              <p className="text-sm text-muted mt-1 font-mono">
                                {line.account}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{line.balance}</p>
                            <p className="text-sm text-muted mt-1">
                              Limit: {Number(line.limit).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8">
                    <div className="text-center text-muted">
                      <p>No trustlines found</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'popular' && (
            <div className="space-y-3">
              {popularTokens.map((token) => {
                const tokenKey = `${token.currency}:${token.issuer}`;
                const isAdded = addedTokens.has(tokenKey);
                
                return (
                  <div
                    key={tokenKey}
                    className="card hover:bg-surface-light/50 transition-colors"
                  >
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{token.name}</h3>
                          <p className="text-sm text-muted mt-1">
                            {token.currency} • {token.issuerName}
                          </p>
                        </div>
                        <button
                          onClick={() => handleSetTrustline(token.currency, token.issuer)}
                          disabled={isAdded || isLoading}
                          className={`btn ${
                            isAdded ? 'btn-secondary opacity-50' : 'btn-primary'
                          }`}
                        >
                          {isAdded ? 'Added' : 'Add Trustline'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Messages */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="card bg-error/10 border border-error/20 p-4"
            >
              <p className="text-error text-sm">{error}</p>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="card bg-success/10 border border-success/20 p-4"
            >
              <p className="text-success text-sm">{success}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Final Warning Modal */}
        <AnimatePresence>
          {showFinalWarning && revokeData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
              onClick={() => !isRevoking && setShowFinalWarning(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <div className="card bg-surface p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-error">Final Warning</h3>
                    {!isRevoking && (
                      <button
                        onClick={() => setShowFinalWarning(false)}
                        className="btn btn-icon"
                      >
                        <RiCloseLine className="text-xl" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="bg-error/10 border border-error/20 p-4 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <RiErrorWarningLine className="text-error text-xl flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-error">Are you absolutely sure?</h4>
                          <p className="text-sm text-error/80 mt-1">
                            You are about to:
                            <ul className="list-disc ml-4 mt-2 space-y-1">
                              <li>Burn {revokeData.balance} {formatCurrencyDisplay(revokeData.currency)} tokens</li>
                              <li>This is irreversible - tokens will be permanently destroyed</li>
                              <li>The trustline will be removed</li>
                            </ul>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-3">
                      {!isRevoking && (
                        <button
                          onClick={() => setShowFinalWarning(false)}
                          className="btn btn-secondary flex-1"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={executeTrustlineRemoval}
                        disabled={isRevoking}
                        className="btn bg-error hover:bg-error/90 text-white flex-1 disabled:bg-error/50"
                      >
                        {isRevoking ? (
                          <div className="flex items-center justify-center space-x-2">
                            <div className="loading-spinner w-4 h-4 border-white/20 border-t-white" />
                            <span>Burning Tokens...</span>
                          </div>
                        ) : (
                          'Yes, Burn Tokens'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing Revoke Confirmation Modal */}
        <AnimatePresence>
          {showRevokeConfirmation && revokeData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
              onClick={() => !isRevoking && setShowRevokeConfirmation(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <div className="card bg-surface p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-error">Remove Trustline</h3>
                    {!isRevoking && (
                      <button
                        onClick={() => setShowRevokeConfirmation(false)}
                        className="btn btn-icon"
                      >
                        <RiCloseLine className="text-xl" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="bg-error/10 border border-error/20 p-4 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <RiErrorWarningLine className="text-error text-xl flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-error">Warning</h4>
                          <p className="text-sm text-error/80 mt-1">
                            Removing this trustline will:
                            <ul className="list-disc ml-4 mt-2 space-y-1">
                              <li>Return your 0.2 XRP reserve</li>
                              <li>Remove your ability to hold this token</li>
                              <li>Any remaining tokens will be burned (permanently destroyed)</li>
                              <li>This action cannot be undone</li>
                            </ul>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface-light p-4 rounded-lg space-y-3">
                      <div>
                        <p className="text-sm text-muted">Currency</p>
                        <p className="font-medium">{formatCurrencyDisplay(revokeData.currency)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted">Issuer</p>
                        <p className="font-mono text-sm break-all">{revokeData.issuer}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted">Current Balance</p>
                        <p className="font-medium">{revokeData.balance} {formatCurrencyDisplay(revokeData.currency)}</p>
                      </div>
                    </div>

                    {Number(revokeData.balance) > 0 && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-sm text-muted mb-2">
                            Enter Password to Confirm Token Burning
                          </label>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              setPasswordError(null);
                            }}
                            placeholder="Enter your wallet password"
                            className="input w-full"
                          />
                        </div>
                        {passwordError && (
                          <p className="text-sm text-error">{passwordError}</p>
                        )}
                      </div>
                    )}

                    <div className="flex space-x-3">
                      {!isRevoking && (
                        <button
                          onClick={() => setShowRevokeConfirmation(false)}
                          className="btn btn-secondary flex-1"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={confirmRevokeTrustline}
                        disabled={isRevoking}
                        className="btn bg-error hover:bg-error/90 text-white flex-1 disabled:bg-error/50"
                      >
                        {isRevoking ? (
                          <div className="flex items-center justify-center space-x-2">
                            <div className="loading-spinner w-4 h-4 border-white/20 border-t-white" />
                            <span>Removing...</span>
                          </div>
                        ) : Number(revokeData?.balance) > 0 ? (
                          'Burn Tokens & Remove Trustline'
                        ) : (
                          'Remove Trustline'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TrustlineManager; 