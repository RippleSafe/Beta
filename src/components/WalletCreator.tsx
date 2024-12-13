import React, { useState } from 'react';
import { Client } from 'xrpl';
import { motion } from 'framer-motion';
import { RiShieldLine, RiLockLine, RiEyeLine, RiEyeOffLine } from 'react-icons/ri';
import { generateWallet } from '../utils/xrpl';
import { useXrpl } from '../contexts/XrplContext';

interface WalletCreatorProps {
  client: Client;
  onWalletCreated: (wallet: any) => void;
}

export const WalletCreator: React.FC<WalletCreatorProps> = ({ client, onWalletCreated }) => {
  const { ensureConnection, disconnect } = useXrpl();
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false);
  const [wallet, setWallet] = useState<any>(null);

  const handleCreateWallet = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Validate password
      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      // Ensure connection before generating wallet
      await ensureConnection(client);

      // Generate new wallet
      const newWallet = await generateWallet(client);
      setWallet(newWallet);

      // Store password
      localStorage.setItem('walletPassword', password);

      // Disconnect after wallet creation
      await disconnect(client);

      // Move to backup step
      setStep(2);
    } catch (error) {
      console.error('Error creating wallet:', error);
      setError('Failed to create wallet. Please try again.');
      await disconnect(client);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmBackup = async () => {
    if (!hasConfirmedBackup) {
      setError('Please confirm that you have backed up your seed phrase');
      return;
    }

    try {
      // Ensure connection before completing wallet creation
      await ensureConnection(client);
      
      // Complete wallet creation
      onWalletCreated(wallet);
    } catch (error) {
      console.error('Error completing wallet creation:', error);
      setError('Failed to complete wallet creation. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md"
      >
        <div className="card bg-surface p-6 space-y-6">
          {step === 1 ? (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">Create Wallet</h1>
                <p className="text-sm text-muted">Set up a password to secure your wallet</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input w-full pr-10"
                      placeholder="Enter password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                    >
                      {showPassword ? <RiEyeOffLine className="text-xl" /> : <RiEyeLine className="text-xl" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input w-full pr-10"
                      placeholder="Confirm password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                    >
                      {showConfirmPassword ? <RiEyeOffLine className="text-xl" /> : <RiEyeLine className="text-xl" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
                  <p className="text-sm text-error">{error}</p>
                </div>
              )}

              <button
                onClick={handleCreateWallet}
                disabled={isLoading || !password || !confirmPassword}
                className="btn btn-primary w-full"
              >
                {isLoading ? 'Creating Wallet...' : 'Create Wallet'}
              </button>
            </>
          ) : (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">Backup Your Wallet</h1>
                <p className="text-sm text-muted">Save these words in a secure location</p>
              </div>

              <div className="card bg-error/10 text-error p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <RiShieldLine className="text-xl" />
                  <p className="font-medium">IMPORTANT</p>
                </div>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>Never share your seed phrase</li>
                  <li>Never enter it on any website</li>
                  <li>Store it securely offline</li>
                  <li>Anyone with these words can access your wallet</li>
                </ul>
              </div>

              <div className="bg-surface-light p-4 rounded-lg">
                {wallet?.mnemonic && wallet.mnemonic.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {wallet.mnemonic.map((word: string, index: number) => (
                      <div key={index} className="flex items-center space-x-2 p-2 bg-surface rounded">
                        <span className="text-muted">{index + 1}.</span>
                        <span className="font-mono">{word}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-sm break-all">{wallet?.seed}</p>
                )}
              </div>

              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={hasConfirmedBackup}
                  onChange={(e) => setHasConfirmedBackup(e.target.checked)}
                  className="form-checkbox"
                />
                <span className="text-sm">
                  I confirm that I have saved my seed phrase in a secure location
                </span>
              </label>

              {error && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
                  <p className="text-sm text-error">{error}</p>
                </div>
              )}

              <button
                onClick={handleConfirmBackup}
                disabled={!hasConfirmedBackup}
                className="btn btn-primary w-full"
              >
                Continue to Wallet
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
