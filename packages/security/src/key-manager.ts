import type { Vault } from './vault.js';
import { createLogger } from '@rangeguard/common';

const logger = createLogger('key-manager');

export class KeyManager {
  private keys: Map<string, string> = new Map();
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  /** Load all keys from vault into memory */
  loadAll(): void {
    const allKeys = this.vault.getAllKeys();
    this.keys.clear();
    for (const [alias, key] of Object.entries(allKeys)) {
      this.keys.set(alias, key);
    }
    logger.info({ count: this.keys.size }, 'Loaded keys into memory');
  }

  /** Get a private key by wallet alias */
  getPrivateKey(alias: string): string {
    const key = this.keys.get(alias);
    if (!key) {
      throw new Error(`No private key found for alias: ${alias}`);
    }
    return key;
  }

  /** Check if a key exists */
  hasKey(alias: string): boolean {
    return this.keys.has(alias);
  }

  /** Get all loaded aliases */
  getAliases(): string[] {
    return Array.from(this.keys.keys());
  }

  /** Clear all keys from memory */
  clear(): void {
    this.keys.clear();
    logger.info('Cleared all keys from memory');
  }
}
