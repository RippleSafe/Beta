import { 
  Client, 
  Wallet, 
  xrpToDrops, 
  dropsToXrp,
  TrustSet,
  Payment,
  Transaction as XrplTransaction
} from 'xrpl';
import * as bip39 from 'bip39';
import { createHash } from 'crypto';

// Mainnet issuers
export const MAINNET_ISSUERS = {
  USD: {
    BITSTAMP: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
    GATEHUB: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq'
  },
  BTC: {
    BITSTAMP: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
    GATEHUB: 'rchGBxcD1A1C2tdxF6papQYZ8kjRKMYcL'
  },
  EUR: {
    BITSTAMP: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
    GATEHUB: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq'
  }
} as const;

// Testnet issuers
export const TESTNET_ISSUERS = {
  USD: {
    FAUCET: 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd'
  },
  EUR: {
    FAUCET: 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd'
  }
} as const;

export interface WalletData {
  address: string;
  seed: string;
  publicKey: string;
  balance?: string;
  mnemonic: string[];
}

export interface PathFindResult {
  alternatives: {
    paths_computed: any[];
    source_amount: any;
  }[];
}

export interface TransactionHistory {
  date: string;
  type: string;
  description: string;
  status: string;
  hash: string;
  fee: string;
  xrpBalanceChange: string;
}

export interface Trustline {
  account: string;
  balance: string;
  currency: string;
  limit: string;
  limit_peer: string;
  quality_in: number;
  quality_out: number;
}

// Connection management with retry and timeout
class ConnectionManager {
  private static instance: ConnectionManager;
  private connectionQueue: Promise<void> | null = null;
  private isConnecting: boolean = false;
  private connectionTimeout: number = 10000;
  private cleanupTimeout: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  private async waitForConnection(client: Client): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.connectionTimeout);

      const cleanup = () => {
        clearTimeout(timeoutId);
      };

      client.once('connected', () => {
        cleanup();
        resolve();
      });

      client.once('disconnected', () => {
        cleanup();
        reject(new Error('Connection failed'));
      });

      client.connect().catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }

  async ensureConnection(client: Client): Promise<void> {
    if (client.isConnected()) {
      return;
    }

    // If already connecting, wait for the current connection attempt
    if (this.isConnecting && this.connectionQueue) {
      return this.connectionQueue;
    }

    try {
      this.isConnecting = true;
      this.connectionQueue = this.waitForConnection(client);
      await this.connectionQueue;

      // Set up cleanup timeout
      if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
      }
      this.cleanupTimeout = setTimeout(() => {
        if (client.isConnected()) {
          this.disconnect(client);
        }
      }, 30000); // Cleanup after 30 seconds of inactivity
    } catch (error) {
      throw error;
    } finally {
      this.isConnecting = false;
      this.connectionQueue = null;
    }
  }

  async disconnect(client: Client): Promise<void> {
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }

    try {
      if (client.isConnected()) {
        await client.disconnect();
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    } finally {
      this.isConnecting = false;
      this.connectionQueue = null;
    }
  }
}

const connectionManager = ConnectionManager.getInstance();

export const generateWallet = async (client: Client): Promise<WalletData> => {
  try {
    // Generate a 24-word mnemonic
    const mnemonic = bip39.generateMnemonic(256);
    
    // Create wallet without funding (since we're on mainnet)
    const wallet = Wallet.generate();

    // Try to fund the wallet if we're on testnet
    try {
      const fundResult = await client.fundWallet();
      return {
        address: fundResult.wallet.address,
        seed: fundResult.wallet.seed!,
        publicKey: fundResult.wallet.publicKey,
        mnemonic: mnemonic.split(' ')
      };
    } catch {
      // If funding fails (e.g., on mainnet), use the generated wallet
      return {
        address: wallet.address,
        seed: wallet.seed!,
        publicKey: wallet.publicKey,
        mnemonic: mnemonic.split(' ')
      };
    }
  } catch (error) {
    console.error('Error generating wallet:', error);
    throw error;
  }
};

export const getBalance = async (
  client: Client,
  address: string,
  ensureConnection: (client: Client) => Promise<void>
): Promise<string> => {
  try {
    await ensureConnection(client);
    
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated'
    });
    
    return dropsToXrp(response.result.account_data.Balance);
  } catch (error: any) {
    if (error.message && error.message.includes('Account not found')) {
      return '0';
    }
    throw error;
  }
};

export const getTrustlines = async (
  client: Client,
  address: string,
  ensureConnection: (client: Client) => Promise<void>
): Promise<Trustline[]> => {
  try {
    await ensureConnection(client);
    
    const response = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated'
    });
    
    return response.result.lines;
  } catch (error: any) {
    if (error.message && error.message.includes('Account not found')) {
      return [];
    }
    throw error;
  }
};

const formatCurrencyCode = (currency: string): { currency: string } => {
  // If it's already a 40-character hex string, use it directly
  if (/^[0-9A-F]{40}$/i.test(currency)) {
    return { currency: currency.toUpperCase() };
  }

  // If it's a 3-character currency code (like USD, EUR)
  if (/^[A-Z0-9]{3}$/.test(currency)) {
    return { currency };
  }

  // For other strings, convert to hex and pad with zeros
  const paddedCurrency = currency.toUpperCase().padEnd(20, '\0');
  
  // Convert to hex
  let hex = '';
  for (let i = 0; i < paddedCurrency.length; i++) {
    hex += paddedCurrency.charCodeAt(i).toString(16).padStart(2, '0');
  }
  
  // Make sure it's exactly 40 characters
  hex = hex.padEnd(40, '0').toUpperCase();
  
  return { currency: hex };
};

export const setupTrustline = async (
  client: Client,
  wallet: { address: string; seed: string },
  currency: string,
  issuer: string,
  limit: string,
  ensureConnection: (client: Client) => Promise<void>
): Promise<any> => {
  try {
    await ensureConnection(client);
    
    const xrplWallet = Wallet.fromSeed(wallet.seed);
    const { currency: formattedCurrency } = formatCurrencyCode(currency);
    
    const trustSet: TrustSet = {
      TransactionType: "TrustSet",
      Account: wallet.address,
      LimitAmount: {
        currency: formattedCurrency,
        issuer,
        value: limit
      }
    };

    console.log('Setting up trustline with:', {
      ...trustSet,
      LimitAmount: {
        ...trustSet.LimitAmount,
        currency: formattedCurrency
      }
    });

    const prepared = await client.autofill(trustSet);
    const signed = xrplWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta && typeof result.result.meta !== 'string') {
      if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Failed to set trustline: ${result.result.meta.TransactionResult}`);
      }
    }

    return result;
  } catch (error) {
    console.error('Error setting up trustline:', error);
    throw error;
  }
};

// Alias for backward compatibility
export const setupTestnetTrustline = setupTrustline;

export const findPath = async (
  client: Client,
  sourceAddress: string,
  destinationAddress: string,
  destinationAmount: {
    currency: string;
    value: string;
    issuer?: string;
  }
): Promise<PathFindResult> => {
  const request = {
    command: 'ripple_path_find',
    source_account: sourceAddress,
    destination_account: destinationAddress,
    destination_amount: destinationAmount.currency === 'XRP'
      ? xrpToDrops(destinationAmount.value)
      : {
          currency: destinationAmount.currency,
          value: destinationAmount.value,
          issuer: destinationAmount.issuer
        }
  };

  const response = await client.request(request);
  return response.result as PathFindResult;
};

export const submitTransaction = async (
  client: Client,
  wallet: { seed: string },
  transaction: Payment | TrustSet
) => {
  const xrplWallet = Wallet.fromSeed(wallet.seed);
  const prepared = await client.autofill(transaction);
  const signed = xrplWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  if (result.result.meta && typeof result.result.meta !== 'string') {
    if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
    }
  }

  return result;
};

export const getTransactionHistory = async (client: Client, address: string): Promise<TransactionHistory[]> => {
  const response = await client.request({
    command: 'account_tx',
    account: address,
    limit: 20
  });

  return response.result.transactions.map((tx: any) => {
    const transaction = tx.tx;
    const meta = tx.meta;
    const date = new Date(transaction.date ? transaction.date : Date.now());
    
    let description = '';
    let xrpBalanceChange = '0';
    
    if (meta && typeof meta !== 'string' && meta.delivered_amount) {
      if (typeof meta.delivered_amount === 'string') {
        xrpBalanceChange = dropsToXrp(meta.delivered_amount);
      }
    }

    const isSender = transaction.Account === address;
    switch (transaction.TransactionType) {
      case 'Payment':
        description = isSender 
          ? `Sent ${xrpBalanceChange} XRP to ${transaction.Destination}`
          : `Received ${xrpBalanceChange} XRP from ${transaction.Account}`;
        break;
      case 'TrustSet':
        description = 'Set Trustline';
        break;
      default:
        description = `${transaction.TransactionType} Transaction`;
    }

    return {
      date: date.toLocaleString(),
      type: transaction.TransactionType,
      description,
      status: meta && typeof meta !== 'string' && meta.TransactionResult === 'tesSUCCESS' 
        ? 'Successful' 
        : 'Failed',
      hash: transaction.hash,
      fee: dropsToXrp(transaction.Fee),
      xrpBalanceChange: isSender ? `-${xrpBalanceChange}` : xrpBalanceChange
    };
  });
};

export const disconnect = async (client: Client): Promise<void> => {
  return connectionManager.disconnect(client);
};

export const revokeTrustline = async (
  client: Client,
  wallet: { address: string; seed: string },
  currency: string,
  issuer: string,
  ensureConnection: (client: Client) => Promise<void>
): Promise<any> => {
  try {
    await ensureConnection(client);
    
    const xrplWallet = Wallet.fromSeed(wallet.seed);
    
    // Check if there's any remaining balance
    const initialTrustlines = await getTrustlines(client, wallet.address, ensureConnection);
    const trustline = initialTrustlines.find(line => line.currency === currency && line.account === issuer);
    
    if (trustline && Number(trustline.balance) > 0) {
      // Burn remaining tokens by sending them back to issuer
      const payment: Payment = {
        TransactionType: "Payment",
        Account: wallet.address,
        Destination: issuer,
        Amount: {
          currency,
          issuer,
          value: trustline.balance
        },
        Flags: 0
      };

      const preparedPayment = await client.autofill(payment);
      const signedPayment = xrplWallet.sign(preparedPayment);
      const burnResult = await client.submitAndWait(signedPayment.tx_blob);

      if (burnResult.result.meta && typeof burnResult.result.meta !== 'string' &&
          burnResult.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Failed to burn tokens: ${burnResult.result.meta.TransactionResult}`);
      }

      // Wait a moment for the burn to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const trustSet: TrustSet = {
      TransactionType: "TrustSet",
      Account: wallet.address,
      LimitAmount: {
        currency,
        issuer,
        value: '0'
      },
      Flags: 0x00200000 | 0x00020000, // tfClearFreeze (0x00200000) | tfClearNoRipple (0x00020000)
    };

    const prepared = await client.autofill(trustSet);
    const signed = xrplWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta && typeof result.result.meta !== 'string') {
      if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Failed to revoke trustline: ${result.result.meta.TransactionResult}`);
      }

      // Check if the reserve was returned
      const balanceChanges = result.result.meta.AffectedNodes.filter((node: any) => 
        node.ModifiedNode?.LedgerEntryType === 'AccountRoot' &&
        node.ModifiedNode?.FinalFields?.Account === wallet.address
      );

      if (balanceChanges.length > 0) {
        console.log('Balance changes:', balanceChanges);
      }
    }

    // Wait a moment and verify the trustline is gone
    await new Promise(resolve => setTimeout(resolve, 1000));
    const finalTrustlines = await getTrustlines(client, wallet.address, ensureConnection);
    const trustlineExists = finalTrustlines.some(line => 
      line.currency === currency && 
      line.account === issuer && 
      Number(line.limit) > 0
    );

    if (trustlineExists) {
      throw new Error('Trustline still exists after deletion attempt');
    }

    return result;
  } catch (error) {
    console.error('Error revoking trustline:', error);
    throw error;
  }
};
