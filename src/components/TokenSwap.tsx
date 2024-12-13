import React, { useState, useEffect } from 'react';
import { Client, Payment } from 'xrpl';
import { motion, AnimatePresence } from 'framer-motion';
import { RiArrowDownLine, RiSwapLine } from 'react-icons/ri';
import { findPath, setupTrustline, submitTransaction, getTrustlines } from '../utils/xrpl';
import { useXrpl } from '../contexts/XrplContext';

interface TokenSwapProps {
  wallet: {
    address: string;
    seed: string;
    publicKey: string;
  };
  client: Client;
}

interface Token {
  currency: string;
  issuer: string;
  name: string;
  balance?: string;
  decodedCurrency?: string;
  logoUrl?: string;
}

interface TokenInfo {
  logoUrl: string | null;
  name: string;
  symbol: string;
}

interface PathFindResponse {
  result: {
    alternatives: Array<{
      paths_computed: Array<Array<{
        currency: string;
        issuer: string;
        type: number;
      }>>;
      source_amount: {
        currency: string;
        issuer?: string;
        value: string;
      };
    }>;
    destination_currencies: string[];
    source_currencies: Array<{
      currency: string;
      issuer?: string;
    }>;
  };
}

// Token image component with error handling
const TokenImage: React.FC<{ token: Token }> = ({ token }) => {
  const [hasError, setHasError] = useState(false);
  const symbol = token.decodedCurrency || token.currency;

  if (hasError || !token.logoUrl) {
    return (
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <span className="text-sm font-medium">
          {symbol.slice(0, 2).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center overflow-hidden">
      <img 
        src={token.logoUrl}
        alt={symbol}
        className="w-8 h-8 object-cover"
        crossOrigin="anonymous"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </div>
  );
};

export const TokenSwap: React.FC<TokenSwapProps> = ({ wallet, client }) => {
  const { ensureConnection } = useXrpl();
  const [fromToken, setFromToken] = useState<Token>({ currency: 'XRP', issuer: '', name: 'XRP' });
  const [toToken, setToToken] = useState<Token | null>(null);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTokenSelect, setShowTokenSelect] = useState<'from' | 'to' | null>(null);
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [availableTokens, setAvailableTokens] = useState<Token[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [tokenInfoCache, setTokenInfoCache] = useState<Record<string, TokenInfo>>({});

  useEffect(() => {
    const loadTokens = async () => {
      try {
        // Check if we're on testnet by looking at the client's connection URL
        const isTestnet = client.url.includes('altnet');
        setNetwork(isTestnet ? 'testnet' : 'mainnet');
        
        // Ensure client is connected before proceeding
        await ensureConnection(client);
        
        // Load available tokens
        await loadAvailableTokens();
      } catch (err) {
        console.error('[TokenSwap] Error in loadTokens:', err);
        setError('Failed to initialize token loading. Please try again.');
      }
    };

    loadTokens();
  }, [client.url, client, wallet.address, ensureConnection]);

  useEffect(() => {
    // Add error event listeners to the client
    const handleError = (error: any) => {
      console.error('[TokenSwap] WebSocket error:', error);
      if (error === 'noPermission') {
        setError('Connection permission denied. Please try again.');
      }
    };

    const handleClose = () => {
      console.log('[TokenSwap] WebSocket connection closed');
    };

    if (client) {
      client.on('error', handleError);
      client.on('disconnected', handleClose);
    }

    return () => {
      if (client) {
        client.off('error', handleError);
        client.off('disconnected', handleClose);
        safeDisconnect();
      }
    };
  }, [client]);

  const safeRequest = async <T,>(request: any): Promise<T> => {
    let attempts = 3;
    const timeout = 10000; // 10 seconds timeout

    while (attempts > 0) {
      try {
        // Ensure fresh connection
        const connected = await safeConnect();
        if (!connected) {
          throw new Error('Failed to establish connection');
        }

        // Create a promise that rejects after timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out')), timeout);
        });

        // Race between the actual request and the timeout
        const response = await Promise.race([
          client.request(request),
          timeoutPromise
        ]);

        return response as T;
      } catch (error: any) {
        console.error(`[TokenSwap] Request attempt ${4 - attempts} failed:`, error);
        
        // Handle specific errors
        if (error.message?.includes('noPermission')) {
          throw new Error('Connection permission denied. Please try again.');
        }
        if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
          console.log('[TokenSwap] Request timed out, retrying...');
        }
        
        await safeDisconnect();
        attempts--;

        if (attempts === 0) {
          if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
            throw new Error('Request timed out. Please check your connection and try again.');
          }
          throw error;
        }

        // Exponential backoff: wait longer between each retry
        await new Promise(resolve => setTimeout(resolve, (4 - attempts) * 2000));
      }
    }
    throw new Error('Request failed after all attempts');
  };

  const decodeHexCurrency = (currency: string): string => {
    if (/^[0-9A-F]{40}$/i.test(currency)) {
      try {
        const bytes = Buffer.from(currency, 'hex');
        const ascii = bytes.toString('ascii').replace(/\0/g, '');
        if (/^[A-Za-z0-9]+$/.test(ascii)) {
          return ascii;
        }
      } catch (e) {
        console.warn('[TokenInfo] Failed to decode hex currency:', e);
      }
    }
    return currency;
  };

  const fetchTokenInfo = async (currency: string, issuer: string): Promise<TokenInfo> => {
    const cacheKey = `${currency}:${issuer}`;
    
    // Check cache first
    if (tokenInfoCache[cacheKey]) {
      return tokenInfoCache[cacheKey];
    }

    // Decode hex currency if needed
    const decodedCurrency = decodeHexCurrency(currency);

    try {
      // Use DexScreener's direct image URL
      const dexScreenerUrl = `https://dd.dexscreener.com/ds-data/tokens/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}.png?size=lg&key=825b1a`;
      
      const tokenInfo: TokenInfo = {
        logoUrl: dexScreenerUrl,
        name: decodedCurrency,
        symbol: decodedCurrency
      };

      // Update cache
      setTokenInfoCache(prev => ({
        ...prev,
        [cacheKey]: tokenInfo
      }));

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
    
    // Update cache even for default info
    setTokenInfoCache(prev => ({
      ...prev,
      [cacheKey]: defaultInfo
    }));
    
    return defaultInfo;
  };

  const loadAvailableTokens = async () => {
    try {
      setIsLoadingTokens(true);
      setError(null);
      console.log('[TokenSwap] Starting to load available tokens');
      
      // Always include XRP
      const tokens: Token[] = [{
        currency: 'XRP',
        issuer: '',
        name: 'XRP',
        balance: '0',
        decodedCurrency: 'XRP',
        logoUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.png'
      }];
      
      // Get trustlines and balances
      console.log('[TokenSwap] Fetching trustlines...');
      const trustlines = await getTrustlines(client, wallet.address, ensureConnection);
      console.log('[TokenSwap] Trustlines received:', trustlines);
      
      if (!Array.isArray(trustlines)) {
        throw new Error('Invalid trustlines response');
      }
      
      // Add tokens from trustlines with balances
      for (const line of trustlines) {
        try {
          console.log('[TokenSwap] Processing trustline:', line);
          if (Number(line.balance) > 0) {
            console.log('[TokenSwap] Found token with positive balance:', line);
            const tokenInfo = await fetchTokenInfo(line.currency, line.account);
            console.log('[TokenSwap] Token info fetched:', tokenInfo);
            tokens.push({
              currency: line.currency,
              issuer: line.account,
              name: tokenInfo.name,
              balance: line.balance,
              decodedCurrency: tokenInfo.symbol,
              logoUrl: tokenInfo.logoUrl || undefined
            });
          }
        } catch (lineError) {
          console.error('[TokenSwap] Error processing trustline:', lineError);
          // Continue processing other trustlines
        }
      }
      
      console.log('[TokenSwap] Final tokens list:', tokens);
      setAvailableTokens(tokens);
      
      // Set default toToken if not set
      if (!toToken && tokens.length > 1) {
        console.log('[TokenSwap] Setting default toToken:', tokens[1]);
        setToToken(tokens[1]);
      }
    } catch (error) {
      console.error('[TokenSwap] Error loading tokens:', error);
      setError('Failed to load available tokens. Please try refreshing.');
      // Set minimum viable token list
      setAvailableTokens([{
        currency: 'XRP',
        issuer: '',
        name: 'XRP',
        balance: '0',
        decodedCurrency: 'XRP',
        logoUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.png'
      }]);
    } finally {
      setIsLoadingTokens(false);
    }
  };

  const handleTokenSelect = (token: Token) => {
    if (showTokenSelect === 'from') {
      setFromToken(token);
      // If same token selected, swap with current 'to' token
      if (toToken && token.currency === toToken.currency && token.issuer === toToken.issuer) {
        setToToken(fromToken);
      }
    } else {
      setToToken(token);
      // If same token selected, swap with current 'from' token
      if (token.currency === fromToken.currency && token.issuer === fromToken.issuer) {
        setFromToken(toToken!);
      }
    }
    setShowTokenSelect(null);
  };

  const handleSwapTokens = () => {
    if (toToken) {
      const temp = fromToken;
      setFromToken(toToken);
      setToToken(temp);
    }
  };

  const checkTrustlineExists = async (currency: string, issuer: string) => {
    try {
      const trustlines = await getTrustlines(client, wallet.address, ensureConnection);
      return trustlines.some(line => 
        line.currency === currency && 
        line.account === issuer
      );
    } catch (error) {
      console.error('[TokenSwap] Error checking trustline:', error);
      return false;
    }
  };

  const safeDisconnect = async () => {
    try {
      if (client && client.isConnected()) {
        await client.disconnect();
      }
    } catch (error) {
      console.error('[TokenSwap] Error during disconnect:', error);
    }
  };

  const safeConnect = async () => {
    try {
      await safeDisconnect();
      await client.connect();
      return true;
    } catch (error) {
      console.error('[TokenSwap] Error during connect:', error);
      return false;
    }
  };

  const validateAmount = (amount: string, currency: string) => {
    const num = Number(amount);
    if (isNaN(num) || num <= 0) {
      throw new Error('Please enter a valid amount greater than 0');
    }
    
    // For XRP, ensure minimum amount (10 drops = 0.00001 XRP)
    if (currency === 'XRP' && num < 0.00001) {
      throw new Error('Minimum XRP amount is 0.00001');
    }
    
    // For tokens, ensure proper decimal places
    if (currency !== 'XRP') {
      const decimals = amount.split('.')[1]?.length || 0;
      if (decimals > 6) {
        throw new Error('Maximum 6 decimal places allowed for tokens');
      }
    }
    
    return true;
  };

  const findSwapPath = async (
    fromCurrency: string,
    fromIssuer: string,
    toCurrency: string,
    toIssuer: string,
    amount: string
  ) => {
    // Validate amount first
    validateAmount(amount, toCurrency);

    try {
      // Calculate amounts with proper precision
      const destinationAmount = toCurrency === 'XRP' 
        ? Math.floor(Number(amount) * 1000000).toString() // Convert to drops
        : amount;

      // Build rippling path find request
      const request = {
        command: "ripple_path_find",
        source_account: wallet.address,
        source_currencies: [{
          currency: fromCurrency,
          issuer: fromIssuer === '' ? undefined : fromIssuer
        }],
        destination_account: wallet.address,
        destination_amount: toCurrency === 'XRP' 
          ? destinationAmount
          : {
              currency: toCurrency,
              issuer: toIssuer,
              value: destinationAmount
            }
      };

      console.log('[TokenSwap] Sending path find request:', request);
      const response = await safeRequest<PathFindResponse>(request);
      console.log('[TokenSwap] Path find response:', response);

      if (!response.result.alternatives || response.result.alternatives.length === 0) {
        throw new Error('No path found for this swap. Please try a different amount or pair.');
      }

      // Validate the response
      const firstPath = response.result.alternatives[0];
      if (!firstPath.paths_computed || firstPath.paths_computed.length === 0) {
        throw new Error('Invalid path received. Please try again.');
      }

      // Check if the source amount is reasonable
      const sourceAmount = firstPath.source_amount;
      if (typeof sourceAmount === 'string') {
        // XRP amount in drops
        const xrpAmount = Number(sourceAmount) / 1000000;
        if (xrpAmount <= 0 || xrpAmount > 100000000) { // Max 100M XRP
          throw new Error('Invalid source amount calculated. Please try a different amount.');
        }
      } else {
        // Token amount
        const tokenAmount = Number(sourceAmount.value);
        if (tokenAmount <= 0 || tokenAmount > 1000000000) { // Max 1B tokens
          throw new Error('Invalid source amount calculated. Please try a different amount.');
        }
      }

      return {
        alternatives: [{
          paths_computed: firstPath.paths_computed,
          source_amount: firstPath.source_amount
        }]
      };
    } catch (error: any) {
      console.error('[TokenSwap] Path finding error:', error);
      
      // Handle specific errors
      if (error.message?.includes('noPermission')) {
        throw new Error('Connection permission denied. Please try again.');
      }
      if (error.message?.includes('tecNO_PATH')) {
        throw new Error('No valid path found for this swap. Please try a different amount or pair.');
      }
      if (error.message?.includes('Connection') || error.message?.includes('connect')) {
        throw new Error('Network connection issue. Please check your connection and try again.');
      }
      if (error.message?.includes('amount')) {
        throw error; // Pass through amount validation errors
      }
      
      throw new Error('Failed to find swap path. Please try again.');
    }
  };

  const handleSwap = async () => {
    if (!toToken) return;

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      // Validate amount
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        throw new Error('Please enter a valid amount greater than 0');
      }

      // Ensure client is connected
      const connected = await safeConnect();
      if (!connected) {
        throw new Error('Failed to establish connection. Please try again.');
      }

      // If swapping to a non-XRP token, check and setup trustline if needed
      if (toToken.currency !== 'XRP') {
        console.log('[TokenSwap] Checking trustline for:', toToken.currency);
        const trustlineExists = await checkTrustlineExists(toToken.currency, toToken.issuer);
        
        if (!trustlineExists) {
          console.log('[TokenSwap] Setting up new trustline for:', toToken.currency);
          try {
            await setupTrustline(
              client,
              wallet,
              toToken.currency,
              toToken.issuer,
              '1000000000',
              ensureConnection
            );
            console.log('[TokenSwap] Trustline setup complete');
          } catch (trustlineError: any) {
            // If the error indicates trustline already exists, we can proceed
            if (trustlineError.message?.includes('tecNO_LINE_REDUNDANT')) {
              console.log('[TokenSwap] Trustline already exists, proceeding with swap');
            } else {
              throw new Error(`Failed to setup trustline: ${trustlineError.message}`);
            }
          }
        } else {
          console.log('[TokenSwap] Trustline already exists, proceeding with swap');
        }
      }

      // Find path for the swap with retries
      console.log('[TokenSwap] Finding path for swap...');
      const path = await findSwapPath(
        fromToken.currency,
        fromToken.issuer,
        toToken.currency,
        toToken.issuer,
        amount
      );

      console.log('[TokenSwap] Path found:', path);

      // Create and submit the payment
      const payment: Payment = {
        TransactionType: "Payment",
        Account: wallet.address,
        Destination: wallet.address,
        Amount: toToken.currency === 'XRP' 
          ? (Number(amount) * 1000000).toString() 
          : {
              currency: toToken.currency,
              issuer: toToken.issuer,
              value: amount
            },
        SendMax: fromToken.currency === 'XRP'
          ? (Number(amount) * 1.05 * 1000000).toString() // 5% slippage
          : {
              currency: fromToken.currency,
              issuer: fromToken.issuer,
              value: (Number(amount) * 1.05).toString()
            },
        Paths: path.alternatives[0].paths_computed
      } as Payment;

      console.log('[TokenSwap] Submitting payment:', payment);
      
      // Submit transaction with retries
      let retries = 3;
      let result;
      while (retries > 0) {
        try {
          const connected = await safeConnect();
          if (!connected) {
            throw new Error('Failed to establish connection');
          }
          
          result = await submitTransaction(client, wallet, payment);
          break;
        } catch (error: any) {
          console.error(`[TokenSwap] Transaction attempt ${4 - retries} failed:`, error);
          await safeDisconnect();
          retries--;
          if (retries === 0) {
            throw new Error('Failed to submit transaction after multiple attempts. Please try again.');
          }
          // Wait longer between retries
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log('[TokenSwap] Swap completed:', result);
      setSuccess('Swap completed successfully!');
      
      // Reload available tokens after successful swap
      await loadAvailableTokens();
    } catch (err: any) {
      console.error('[TokenSwap] Swap error:', err);
      setError(err.message || 'Failed to complete swap. Please try again.');
      
      // If there was an error, reload tokens to show current balances
      try {
        await loadAvailableTokens();
      } catch (loadError) {
        console.error('[TokenSwap] Error reloading tokens after failed swap:', loadError);
      }
    } finally {
      setIsLoading(false);
      // Ensure client is disconnected
      await safeDisconnect();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card bg-gradient-to-br from-surface-light to-surface p-6">
        <h2 className="text-xl font-bold mb-2">Swap Tokens</h2>
        <p className="text-sm text-muted">Exchange tokens instantly</p>
      </div>

      {/* Swap Interface */}
      <div className="card bg-surface p-6 space-y-4">
        {/* From Token */}
        <div className="space-y-2">
          <label className="text-sm text-muted">From</label>
          <button
            onClick={() => setShowTokenSelect('from')}
            className="w-full bg-surface-light rounded-lg p-4 flex items-center justify-between hover:bg-surface-light/80 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <TokenImage token={fromToken} />
              <div>
                <span className="font-medium">{fromToken.decodedCurrency || fromToken.currency}</span>
                {fromToken.balance && (
                  <p className="text-sm text-muted">Balance: {fromToken.balance}</p>
                )}
              </div>
            </div>
            <RiArrowDownLine className="text-xl text-muted" />
          </button>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center">
          <button
            onClick={handleSwapTokens}
            disabled={!toToken}
            className="bg-surface-light w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-light/80 transition-colors disabled:opacity-50"
          >
            <RiSwapLine className="text-xl rotate-90" />
          </button>
        </div>

        {/* To Token */}
        <div className="space-y-2">
          <label className="text-sm text-muted">To</label>
          <button
            onClick={() => setShowTokenSelect('to')}
            className="w-full bg-surface-light rounded-lg p-4 flex items-center justify-between hover:bg-surface-light/80 transition-colors"
          >
            {toToken ? (
              <div className="flex items-center space-x-3">
                <TokenImage token={toToken} />
                <div>
                  <span className="font-medium">{toToken.decodedCurrency || toToken.currency}</span>
                  <p className="text-sm text-muted">
                    {toToken.issuer ? `${toToken.issuer.slice(0, 4)}...${toToken.issuer.slice(-4)}` : 'Native'}
                  </p>
                  {toToken.balance && (
                    <p className="text-sm text-muted">Balance: {toToken.balance}</p>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-muted">Select token</span>
            )}
            <RiArrowDownLine className="text-xl text-muted" />
          </button>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <label className="text-sm text-muted">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-surface-light rounded-lg p-4"
          />
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
        {success && (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
            <p className="text-sm text-success">{success}</p>
          </div>
        )}

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={isLoading || !amount || Number(amount) <= 0}
          className="btn btn-primary w-full"
        >
          {isLoading ? 'Swapping...' : 'Swap'}
        </button>
      </div>

      {/* Token Select Modal */}
      <AnimatePresence>
        {showTokenSelect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowTokenSelect(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="card bg-surface p-6 space-y-4">
                <h3 className="text-lg font-bold">Select Token</h3>
                {isLoadingTokens ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="loading-spinner" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableTokens.map((token) => (
                      <button
                        key={`${token.currency}-${token.issuer}`}
                        onClick={() => handleTokenSelect(token)}
                        className="w-full bg-surface-light rounded-lg p-4 flex items-center justify-between hover:bg-surface-light/80 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <TokenImage token={token} />
                          <div>
                            <span className="font-medium">{token.decodedCurrency || token.currency}</span>
                            <p className="text-sm text-muted">
                              {token.issuer ? `${token.issuer.slice(0, 4)}...${token.issuer.slice(-4)}` : 'Native'}
                            </p>
                            {token.balance && (
                              <p className="text-sm text-muted">Balance: {token.balance}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 