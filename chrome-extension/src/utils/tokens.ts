interface TokenInfo {
  name: string;
  symbol: string;
  issuerName: string;
  icon?: string;
}

export const getTokenInfo = (issuer: string, currency: string): TokenInfo => {
  // Default token info
  return {
    name: currency,
    symbol: currency,
    issuerName: issuer,
  };
}; 