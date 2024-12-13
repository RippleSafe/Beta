interface TokenInfo {
  name: string;
  symbol: string;
  issuerName: string;
  icon?: string;
}

interface TokenMetadata {
  [key: string]: TokenInfo;
}

// Token metadata mapping (issuer address -> token info)
export const tokenMetadata: TokenMetadata = {
  'rsuUjfWxrACCAwGQDsNeZUhpzXf1n1NK5Z': {
    name: 'GateHub USD',
    symbol: 'USD',
    issuerName: 'GateHub',
    icon: 'https://dd.dexscreener.com/ds-data/tokens/xrpl/usd.rsuujfwxraccawgqdsneZuhpzxf1n1nk5z.png?size=lg&key=825b1a'
  },
  'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq': {
    name: 'Bitstamp USD',
    symbol: 'USD',
    issuerName: 'Bitstamp',
    icon: 'https://dd.dexscreener.com/ds-data/tokens/xrpl/usd.rhub8vrn55s94qwkdv6jmdy1puykjzf3wq.png?size=lg&key=825b1a'
  },
  'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B': {
    name: 'Bitstamp BTC',
    symbol: 'BTC',
    issuerName: 'Bitstamp',
    icon: 'https://dd.dexscreener.com/ds-data/tokens/xrpl/btc.rvyafwj5gh67ov6fw32zzp3aw4eubs59b.png?size=lg&key=825b1a'
  },
  'rchGBxcD1A1C2tdxF6papQYZ8kjRKMYcL': {
    name: 'GateHub BTC',
    symbol: 'BTC',
    issuerName: 'GateHub',
    icon: 'https://dd.dexscreener.com/ds-data/tokens/xrpl/btc.rchgbxcd1a1c2tdxf6papqyz8kjrkmycl.png?size=lg&key=825b1a'
  },
  'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q': {
    name: 'Ripple BTC',
    symbol: 'BTC',
    issuerName: 'Ripple',
    icon: 'https://dd.dexscreener.com/ds-data/tokens/xrpl/btc.rmwjyedjc7qqtkyvliaccjsmcwih4lne2q.png?size=lg&key=825b1a'
  },
  'rLEsXccBGNR3UPuPu2hUXPjziKC3qKSBun': {
    name: 'GateHub ETH',
    symbol: 'ETH',
    issuerName: 'GateHub',
    icon: 'https://dd.dexscreener.com/ds-data/tokens/xrpl/eth.rlesxccbgnr3upupu2huxpjzikc3qksbun.png?size=lg&key=825b1a'
  },
  // Add more token metadata as needed
};

export const getTokenInfo = (issuer: string, currency: string): TokenInfo => {
  // If currency is hex, decode it for display but keep hex for URL
  let displayName = currency;
  if (/^[0-9A-F]{40}$/i.test(currency)) {
    try {
      const ascii = Buffer.from(currency, 'hex').toString('ascii').replace(/\0/g, '');
      if (ascii.match(/^[A-Za-z0-9]{3,}$/)) {
        displayName = ascii;
      }
    } catch {
      // Keep original currency if decode fails
    }
  }

  const defaultInfo: TokenInfo = {
    name: displayName,
    symbol: displayName,
    issuerName: `${issuer.slice(0, 4)}...${issuer.slice(-4)}`,
    icon: `https://dd.dexscreener.com/ds-data/tokens/xrpl/${currency.toLowerCase()}.${issuer.toLowerCase()}.png?size=lg&key=825b1a`
  };

  return tokenMetadata[issuer] || defaultInfo;
};

export const formatCurrency = (currency: string): string => {
  // If currency is a hex value (non-standard currency code)
  if (/^[0-9A-F]{40}$/i.test(currency)) {
    // Try to convert hex to ASCII, fallback to first 3 characters of hex
    try {
      const ascii = Buffer.from(currency, 'hex').toString('ascii').replace(/\0/g, '');
      return ascii.match(/^[A-Za-z0-9]{3,}$/) ? ascii : currency.slice(0, 3);
    } catch {
      return currency.slice(0, 3);
    }
  }
  return currency;
}; 