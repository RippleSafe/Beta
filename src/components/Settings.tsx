import React, { useState, useEffect } from 'react';
import { RiEyeLine, RiEyeOffLine, RiLockLine, RiKey2Line, RiShieldLine, RiCloseLine, RiTerminalBoxLine, RiCodeLine, RiErrorWarningLine } from 'react-icons/ri';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsProps {
  wallet: {
    address: string;
    seed: string;
    publicKey: string;
    mnemonic?: string[];
  };
  onNetworkChange: (network: 'mainnet' | 'testnet') => void;
  currentNetwork: 'mainnet' | 'testnet';
  onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ wallet, onNetworkChange, currentNetwork, onClose }) => {
  const [showSeed, setShowSeed] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [storedPassword, setStoredPassword] = useState(localStorage.getItem('walletPassword') || '');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [developerClickCount, setDeveloperClickCount] = useState(0);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [showNetworkConfirm, setShowNetworkConfirm] = useState<'mainnet' | 'testnet' | null>(null);
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [showPrivateKeyData, setShowPrivateKeyData] = useState(false);

  useEffect(() => {
    const devMode = localStorage.getItem('developerMode') === 'true';
    setIsDeveloperMode(devMode);
  }, []);

  const handleDeveloperClick = () => {
    if (!isDeveloperMode) {
      setDeveloperClickCount(prev => {
        const newCount = prev + 1;
        if (newCount >= 7) {
          const newDevMode = true;
          setIsDeveloperMode(newDevMode);
          localStorage.setItem('developerMode', String(newDevMode));
          setDeveloperClickCount(0);
          return 0;
        }
        return newCount;
      });
    }
  };

  const handleDisableDeveloperMode = () => {
    setIsDeveloperMode(false);
    localStorage.setItem('developerMode', 'false');
    setShowDisableConfirm(false);
    setDeveloperClickCount(0);
  };

  const handlePasswordSubmit = (type: 'seed' | 'privateKey') => {
    if (password === storedPassword) {
      if (type === 'seed') {
        setShowSeedPhrase(true);
      } else {
        setShowPrivateKeyData(true);
      }
      setError(null);
      setPassword('');
    } else {
      setError('Incorrect password');
    }
  };

  const handleChangePassword = () => {
    if (currentPassword !== storedPassword) {
      setError('Current password is incorrect');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    localStorage.setItem('walletPassword', newPassword);
    setStoredPassword(newPassword);
    setSuccess('Password changed successfully');
    setError(null);
    setShowChangePassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleInitialPasswordSet = () => {
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    localStorage.setItem('walletPassword', newPassword);
    setStoredPassword(newPassword);
    setSuccess('Password set successfully');
    setError(null);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleNetworkSwitch = (network: 'mainnet' | 'testnet') => {
    if (network === currentNetwork) return;
    setShowNetworkConfirm(network);
  };

  const confirmNetworkSwitch = () => {
    if (!showNetworkConfirm) return;
    onNetworkChange(showNetworkConfirm);
    setShowNetworkConfirm(null);
  };

  // Format seed for display
  const formatSeedForDisplay = (seed: string) => {
    // Remove 's' prefix if present
    const cleanSeed = seed.startsWith('s') ? seed.slice(1) : seed;
    
    // Split into groups of 4 characters
    const groups = cleanSeed.match(/.{1,4}/g) || [];
    return groups.map((group, index) => ({
      number: index + 1,
      segment: group
    }));
  };

  // Format private key for display
  const formatPrivateKey = (key: string) => {
    return key.startsWith('s') ? key : 's' + key;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold">Settings</h2>
          <p className="text-sm text-muted">Manage your wallet settings</p>
        </div>
        <button
          onClick={onClose}
          className="btn btn-icon p-2"
          title="Close Settings"
        >
          <RiCloseLine className="text-xl" />
        </button>
      </div>

      {/* Security Settings */}
      <div className="card bg-gradient-to-br from-surface-light to-surface p-4 space-y-4">
        <div className="flex items-center gap-3">
          <RiShieldLine className="text-xl" />
          <div>
            <h3 className="font-medium">Security</h3>
            <p className="text-sm text-muted">Manage your security settings</p>
          </div>
        </div>

        {/* View Recovery Phrase */}
        <div className="space-y-3">
          <button
            onClick={() => {
              setShowSeed(!showSeed);
              setShowSeedPhrase(false);
              setPassword('');
            }}
            className="btn btn-secondary w-full py-3 flex items-center justify-between"
          >
            <span>View Recovery Phrase</span>
            <RiKey2Line className="text-xl" />
          </button>

          <AnimatePresence>
            {showSeed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 overflow-hidden"
              >
                {!storedPassword ? (
                  <div className="bg-warning/10 border border-warning/20 p-4 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <RiErrorWarningLine className="text-warning text-xl flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-warning">
                        Please set a password first to view sensitive information
                      </p>
                    </div>
                  </div>
                ) : showSeedPhrase ? (
                  <div className="space-y-3">
                    <div className="bg-warning/10 border border-warning/20 p-4 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <RiErrorWarningLine className="text-warning text-xl flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-warning">Warning</h4>
                          <p className="text-sm text-warning/80 mt-1">
                            Never share your recovery phrase with anyone. These 24 words can be used to restore your wallet.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-surface-light p-4 rounded-lg">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {wallet.mnemonic ? (
                          wallet.mnemonic.map((word, index) => (
                            <div 
                              key={index}
                              className="flex items-center space-x-2 p-2 bg-surface rounded-lg"
                            >
                              <span className="text-xs text-muted">{index + 1}.</span>
                              <span className="font-mono">{word}</span>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-full text-center text-muted">
                            Recovery phrase not available
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter Password"
                      className="input w-full py-3"
                    />
                    <button
                      onClick={() => handlePasswordSubmit('seed')}
                      className="btn btn-primary w-full py-3"
                    >
                      View Recovery Phrase
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* View Private Key */}
        <div className="space-y-3">
          <button
            onClick={() => {
              setShowPrivateKey(!showPrivateKey);
              setShowPrivateKeyData(false);
              setPassword('');
            }}
            className="btn btn-secondary w-full py-3 flex items-center justify-between"
          >
            <span>View Secret Key</span>
            <RiKey2Line className="text-xl" />
          </button>

          <AnimatePresence>
            {showPrivateKey && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 overflow-hidden"
              >
                {!storedPassword ? (
                  <div className="bg-warning/10 border border-warning/20 p-4 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <RiErrorWarningLine className="text-warning text-xl flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-warning">
                        Please set a password first to view sensitive information
                      </p>
                    </div>
                  </div>
                ) : showPrivateKeyData ? (
                  <div className="space-y-3">
                    <div className="bg-warning/10 border border-warning/20 p-4 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <RiErrorWarningLine className="text-warning text-xl flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-warning">Warning</h4>
                          <p className="text-sm text-warning/80 mt-1">
                            Never share your secret key with anyone. It provides full access to your wallet.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-surface-light p-4 rounded-lg">
                      <div className="font-mono text-sm break-all">
                        {formatPrivateKey(wallet.seed)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter Password"
                      className="input w-full py-3"
                    />
                    <button
                      onClick={() => handlePasswordSubmit('privateKey')}
                      className="btn btn-primary w-full py-3"
                    >
                      View Secret Key
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Change Password */}
        <div className="space-y-3">
          <button
            onClick={() => setShowChangePassword(!showChangePassword)}
            className="btn btn-secondary w-full py-3 flex items-center justify-between"
          >
            <span>Change Password</span>
            <RiLockLine className="text-xl" />
          </button>

          <AnimatePresence>
            {showChangePassword && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 overflow-hidden"
              >
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current Password"
                  className="input w-full py-3"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New Password"
                  className="input w-full py-3"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm New Password"
                  className="input w-full py-3"
                />
                <button
                  onClick={handleChangePassword}
                  className="btn btn-primary w-full py-3"
                >
                  Update Password
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Developer Tools */}
      <div 
        className="card bg-gradient-to-br from-surface-light to-surface p-4 cursor-pointer hover:bg-surface-light/50 active:bg-surface-light transition-colors group touch-manipulation"
        onClick={handleDeveloperClick}
      >
        <div className="flex items-center justify-between min-h-[3rem]">
          <div className="flex items-center gap-3">
            <RiTerminalBoxLine className="text-xl" />
            <div>
              <h3 className="font-medium">Developer Tools</h3>
              <p className="text-sm text-muted">
                {isDeveloperMode 
                  ? "Developer mode is enabled" 
                  : `Click ${7 - developerClickCount} more times to enable`}
              </p>
            </div>
          </div>
          {isDeveloperMode ? (
            <div className="relative">
              <div className="px-3 py-1.5 bg-success/20 text-success text-xs rounded-full transition-opacity group-hover:opacity-0 group-active:opacity-0">
                Enabled
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDisableConfirm(true);
                }}
                className="px-3 py-1.5 bg-error/20 text-error text-xs rounded-full absolute inset-0 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
              >
                Disable
              </button>
            </div>
          ) : developerClickCount > 0 && (
            <div className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center text-sm">
              {7 - developerClickCount}
            </div>
          )}
        </div>
      </div>

      {/* Network Settings - Only visible in developer mode */}
      <AnimatePresence>
        {isDeveloperMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="card bg-gradient-to-br from-surface-light to-surface p-4"
          >
            <div className="flex items-center gap-3 mb-4">
              <RiCodeLine className="text-xl" />
              <div>
                <h3 className="font-medium">Network Settings</h3>
                <p className="text-sm text-muted">Configure network connection</p>
              </div>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => handleNetworkSwitch('mainnet')}
                className={`btn w-full py-3 ${
                  currentNetwork === 'mainnet'
                    ? 'btn-primary'
                    : 'btn-secondary'
                }`}
              >
                Mainnet
              </button>
              <button
                onClick={() => handleNetworkSwitch('testnet')}
                className={`btn w-full py-3 ${
                  currentNetwork === 'testnet'
                    ? 'btn-primary'
                    : 'btn-secondary'
                }`}
              >
                Testnet
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Network Switch Confirmation Modal */}
      <AnimatePresence>
        {showNetworkConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowNetworkConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm mx-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="card bg-surface p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">
                    Switch to {showNetworkConfirm === 'mainnet' ? 'Mainnet' : 'Testnet'}?
                  </h3>
                  <button
                    onClick={() => setShowNetworkConfirm(null)}
                    className="btn btn-icon p-2"
                  >
                    <RiCloseLine className="text-xl" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-warning/10 border border-warning/20 p-4 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <RiErrorWarningLine className="text-warning text-xl flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-warning">Warning</h4>
                        <p className="text-sm text-warning/80 mt-1">
                          {showNetworkConfirm === 'mainnet' ? (
                            <>
                              Switching to Mainnet means you'll be using real XRP and assets.
                              Make sure you understand the implications:
                              <ul className="list-disc ml-4 mt-2 space-y-1">
                                <li>Real funds will be used</li>
                                <li>Transactions cannot be reversed</li>
                                <li>Network fees will be charged</li>
                              </ul>
                            </>
                          ) : (
                            <>
                              Switching to Testnet means:
                              <ul className="list-disc ml-4 mt-2 space-y-1">
                                <li>Test XRP will be used (no real value)</li>
                                <li>Some features may be limited</li>
                                <li>Network may be less stable</li>
                              </ul>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowNetworkConfirm(null)}
                      className="btn btn-secondary flex-1 py-3"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmNetworkSwitch}
                      className="btn btn-primary flex-1 py-3"
                    >
                      Switch Network
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disable Developer Mode Confirmation Modal */}
      <AnimatePresence>
        {showDisableConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDisableConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm mx-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="card bg-surface p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">Disable Developer Mode</h3>
                  <button
                    onClick={() => setShowDisableConfirm(false)}
                    className="btn btn-icon p-2"
                  >
                    <RiCloseLine className="text-xl" />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-muted">
                    Are you sure you want to disable developer mode? This will hide network settings and other developer features.
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDisableConfirm(false)}
                      className="btn btn-secondary flex-1 py-3"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDisableDeveloperMode}
                      className="btn btn-primary flex-1 py-3"
                    >
                      Disable
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
    </div>
  );
}; 