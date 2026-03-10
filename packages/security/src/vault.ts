import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface VaultData {
  keys: Record<string, string>; // alias -> encrypted private key hex
}

const ALGORITHM = 'aes-256-gcm';
const SCRYPT_N = 2 ** 17; // 131072
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

export class Vault {
  private password: string;
  private vaultPath: string;

  constructor(password: string, vaultPath: string) {
    this.password = password;
    this.vaultPath = vaultPath;
  }

  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.password, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    }) as Buffer;
  }

  private encrypt(data: string): Buffer {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = this.deriveKey(salt);

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: salt(32) + iv(16) + authTag(16) + encrypted(variable)
    return Buffer.concat([salt, iv, authTag, encrypted]);
  }

  private decrypt(buffer: Buffer): string {
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = buffer.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
    );
    const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = this.deriveKey(salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  private load(): VaultData {
    if (!existsSync(this.vaultPath)) {
      return { keys: {} };
    }
    const buffer = readFileSync(this.vaultPath);
    const json = this.decrypt(buffer);
    return JSON.parse(json) as VaultData;
  }

  private save(data: VaultData): void {
    const dir = dirname(this.vaultPath);
    mkdirSync(dir, { recursive: true });

    const json = JSON.stringify(data);
    const encrypted = this.encrypt(json);
    writeFileSync(this.vaultPath, encrypted, { mode: 0o600 });
  }

  /** Add or update a key in the vault */
  setKey(alias: string, privateKey: string): void {
    const data = this.load();
    data.keys[alias] = privateKey;
    this.save(data);
  }

  /** Get a private key by alias */
  getKey(alias: string): string | undefined {
    const data = this.load();
    return data.keys[alias];
  }

  /** Remove a key from the vault */
  removeKey(alias: string): boolean {
    const data = this.load();
    if (!(alias in data.keys)) return false;
    delete data.keys[alias];
    this.save(data);
    return true;
  }

  /** List all aliases in the vault */
  listAliases(): string[] {
    const data = this.load();
    return Object.keys(data.keys);
  }

  /** Check if vault file exists */
  exists(): boolean {
    return existsSync(this.vaultPath);
  }

  /** Get all keys (for key-manager to load into memory) */
  getAllKeys(): Record<string, string> {
    const data = this.load();
    return { ...data.keys };
  }
}
