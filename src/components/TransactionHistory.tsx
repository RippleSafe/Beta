import React, { useState, useEffect } from 'react';
import { Client } from 'xrpl';
import { getTransactionHistory, TransactionHistory as TransactionHistoryType } from '../utils/xrpl';
import { RiArrowUpLine, RiArrowDownLine, RiSwapLine, RiRefreshLine } from 'react-icons/ri';

interface TransactionHistoryProps {
  wallet: {
    address: string;
  };
  client: Client;
  currentNetwork: 'mainnet' | 'testnet';
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ wallet, client, currentNetwork }) => {
  const [transactions, setTransactions] = useState<TransactionHistoryType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const getExplorerUrl = (hash: string) => {
    return currentNetwork === 'mainnet'
      ? `https://livenet.xrpl.org/transactions/${hash}`
      : `https://testnet.xrpl.org/transactions/${hash}`;
  };

  useEffect(() => {
    fetchTransactions();
  }, [wallet.address, refreshKey]);

  const fetchTransactions = async () => {
    console.log('Fetching transactions for wallet:', wallet.address);
    try {
      setIsLoading(true);
      setError(null);
      const history = await getTransactionHistory(client, wallet.address);
      console.log('Fetched transactions:', history);
      setTransactions(history);
      if (isManualRefresh) {
        setShowRefreshSuccess(true);
        setTimeout(() => setShowRefreshSuccess(false), 2000);
      }
      setIsManualRefresh(false);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    setIsManualRefresh(true);
    setRefreshKey(prev => prev + 1);
  };

  const getTransactionIcon = (type: string, isNegative: boolean) => {
    switch (type) {
      case 'Payment':
        return isNegative ? 
          <RiArrowUpLine className="text-xl" /> : 
          <RiArrowDownLine className="text-xl" />;
      case 'TrustSet':
        return <RiSwapLine className="text-xl" />;
      default:
        return <RiSwapLine className="text-xl" />;
    }
  };

  const getTransactionColor = (type: string, isNegative: boolean) => {
    switch (type) {
      case 'Payment':
        return isNegative ? 'text-error' : 'text-success';
      case 'TrustSet':
        return 'text-primary';
      default:
        return 'text-primary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card bg-gradient-to-br from-surface-light to-surface p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold mb-2">Transaction History</h2>
            <p className="text-sm text-muted">View and track your transactions</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="btn btn-icon"
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
              <span>Transactions Updated!</span>
            </div>
          </div>
        </div>
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
        ) : transactions.length === 0 ? (
          <div className="card p-8">
            <div className="text-center text-muted">
              <p>No transactions found</p>
            </div>
          </div>
        ) : (
          transactions.map((tx: any, index: number) => (
            <div
              key={index}
              className="card hover:bg-surface-light/50 transition-colors"
            >
              <div className="p-4">
                <div className="flex items-start space-x-4">
                  <div className={`w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center ${getTransactionColor(tx.type, tx.xrpBalanceChange.startsWith('-'))}`}>
                    {getTransactionIcon(tx.type, tx.xrpBalanceChange.startsWith('-'))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">
                          {tx.description}
                        </p>
                        <p className="text-sm text-muted mt-1">
                          {tx.date}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${getTransactionColor(tx.type, tx.xrpBalanceChange.startsWith('-'))}`}>
                          {tx.xrpBalanceChange} XRP
                        </p>
                        <p className="text-sm text-muted mt-1">
                          Fee: {tx.fee} XRP
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-sm">
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
                        className="text-primary hover:text-primary-dark transition-colors"
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

export default TransactionHistory; 