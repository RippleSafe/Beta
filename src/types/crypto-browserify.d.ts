declare module 'crypto-browserify' {
  export interface Hash {
    update(data: Buffer | string): Hash;
    digest(): Buffer;
  }

  export function createHash(algorithm: string): Hash;
} 