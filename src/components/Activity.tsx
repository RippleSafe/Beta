import React, { useState, useEffect } from 'react';
import { Client } from 'xrpl';
import { getTransactionHistory, TransactionHistory, getBalance } from '../utils/xrpl';
import { RiArrowUpLine, RiArrowDownLine, RiSwapLine, RiErrorWarningLine } from 'react-icons/ri';
import { motion } from 'framer-motion';
import { useXrpl } from '../contexts/XrplContext';

interface ActivityProps {
  wallet: {
    address: string;
    seed: string;
    publicKey: string;
  };
  client: Client;
  currentNetwork: 'mainnet' | 'testnet';
}

export const Activity: React.FC<ActivityProps> = ({ wallet, client, currentNetwork }) => {
  const { ensureConnection } = useXrpl();
  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccountActivated, setIsAccountActivated] = useState(true);
  const [balance, setBalance] = useState('0');
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  useEffect(() => {
    checkAccountStatus();
  }, [wallet.address]);

  const checkAccountStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await ensureConnection(client);
      
      const accountBalance = await getBalance(client, wallet.address, ensureConnection);
      setBalance(accountBalance);
      setIsAccountActivated(true);
      await fetchTransactions();
    } catch (err: any) {
      console.error('Error checking account status:', err);
      if (err.message?.includes('Account not found')) {
        setIsAccountActivated(false);
        setError('Account needs to be activated with a minimum of 2 XRP');
      } else if (err.message?.includes('WebSocket')) {
        handleConnectionError();
      } else {
        setError('Failed to check account status');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectionError = () => {
    if (retryCount < maxRetries) {
      setError(`Connection error. Retrying... (${retryCount + 1}/${maxRetries})`);
      setRetryCount(prev => prev + 1);
      setTimeout(checkAccountStatus, 2000);
    } else {
      setError('Unable to connect to the network. Please try again later.');
    }
  };

  const fetchTransactions = async () => {
    if (!isAccountActivated) return;

    try {
      const history = await getTransactionHistory(client, wallet.address);
      setTransactions(history);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
      if (err.message?.includes('WebSocket')) {
        handleConnectionError();
      } else {
        setError('Failed to fetch transaction history');
      }
    }
  };

  const handleRetry = () => {
    setRetryCount(0);
    setError(null);
    checkAccountStatus();
  };

  const getExplorerUrl = (hash: string) => {
    return currentNetwork === 'mainnet'
      ? `https://livenet.xrpl.org/transactions/${hash}`
      : `https://testnet.xrpl.org/transactions/${hash}`;
  };

  return (
    <div className="space-y-6">
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
                Your account needs to be activated with a minimum of 2 XRP before you can see transaction history.
                Current balance: {balance} XRP
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Error Display */}
      {error && !isAccountActivated && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-error/10 border border-error/20 p-4"
        >
          <div className="flex items-start space-x-3">
            <RiErrorWarningLine className="text-error text-xl flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-error">{error}</p>
              {retryCount >= maxRetries && (
                <button
                  onClick={handleRetry}
                  className="mt-2 btn btn-secondary btn-sm"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Transactions List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="card p-8">
            <div className="flex flex-col items-center justify-center text-muted">
              <div className="loading-spinner mb-4" />
              <p>Loading transactions...</p>
            </div>
          </div>
        ) : !isAccountActivated ? (
          <div className="card p-8">
            <div className="text-center text-muted">
              <p>No transactions available</p>
              <p className="text-sm mt-2">Activate your account to start transacting</p>
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="card p-8">
            <div className="text-center text-muted">
              <p>No transactions found</p>
            </div>
          </div>
        ) : (
          transactions.map((tx, index) => (
            <div
              key={tx.hash || index}
              className="card hover:bg-surface-light/50 transition-colors"
            >
              <div className="p-4">
                <div className="flex items-start space-x-4">
                  <div className={`w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center ${
                    tx.xrpBalanceChange.startsWith('-') ? 'text-error' : 'text-success'
                  }`}>
                    {tx.type === 'Payment' ? (
                      tx.xrpBalanceChange.startsWith('-') ? (
                        <RiArrowUpLine className="text-xl" />
                      ) : (
                        <RiArrowDownLine className="text-xl" />
                      )
                    ) : (
                      <RiSwapLine className="text-xl" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{tx.description}</h3>
                      <p className={`font-medium ${
                        tx.xrpBalanceChange.startsWith('-') ? 'text-error' : 'text-success'
                      }`}>
                        {tx.xrpBalanceChange} XRP
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-sm text-muted">{tx.date}</p>
                      <p className="text-sm text-muted">Fee: {tx.fee} XRP</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        tx.status === 'Successful' 
                          ? 'bg-success/10 text-success' 
                          : 'bg-error/10 text-error'
                      }`}>
                        {tx.status}
                      </span>
                      <a
                        href={getExplorerUrl(tx.hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary-dark transition-colors text-sm"
                      >
                        View on Explorer
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}; 