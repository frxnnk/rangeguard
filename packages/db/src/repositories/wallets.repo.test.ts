import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/001_initial.js';
import { WalletsRepository } from './wallets.repo.js';

describe('WalletsRepository', () => {
  let db: Database.Database;
  let repo: WalletsRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new WalletsRepository(db);
  });

  describe('create', () => {
    it('should create a wallet with default threshold', () => {
      const wallet = repo.create({
        alias: 'my-wallet',
        address: '0xabc123',
        walletType: 'protection',
      });

      expect(wallet.id).toBeDefined();
      expect(wallet.alias).toBe('my-wallet');
      expect(wallet.address).toBe('0xabc123');
      expect(wallet.walletType).toBe('protection');
      expect(wallet.lowBalanceThreshold).toBe('100');
      expect(wallet.createdAt).toBeGreaterThan(0);
    });

    it('should create a wallet with custom threshold', () => {
      const wallet = repo.create({
        alias: 'custom-wallet',
        address: '0xdef456',
        walletType: 'profit',
        lowBalanceThreshold: '500',
      });

      expect(wallet.lowBalanceThreshold).toBe('500');
      expect(wallet.walletType).toBe('profit');
    });
  });

  describe('findById', () => {
    it('should return wallet when exists', () => {
      const created = repo.create({
        alias: 'find-me',
        address: '0x111',
        walletType: 'protection',
      });

      const found = repo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.alias).toBe('find-me');
    });

    it('should return undefined when not exists', () => {
      const found = repo.findById('nonexistent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('findByAlias', () => {
    it('should find by alias', () => {
      repo.create({
        alias: 'unique-alias',
        address: '0x222',
        walletType: 'protection',
      });

      const found = repo.findByAlias('unique-alias');
      expect(found).toBeDefined();
      expect(found!.alias).toBe('unique-alias');
    });

    it('should return undefined when alias not found', () => {
      const found = repo.findByAlias('no-such-alias');
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all wallets', () => {
      repo.create({ alias: 'w1', address: '0xa', walletType: 'protection' });
      repo.create({ alias: 'w2', address: '0xb', walletType: 'profit' });

      const all = repo.findAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('findByType', () => {
    it('should filter by wallet type', () => {
      repo.create({ alias: 'prot1', address: '0xa', walletType: 'protection' });
      repo.create({ alias: 'prot2', address: '0xb', walletType: 'protection' });
      repo.create({ alias: 'prof1', address: '0xc', walletType: 'profit' });

      const protectionWallets = repo.findByType('protection');
      expect(protectionWallets).toHaveLength(2);
      expect(protectionWallets.every((w) => w.walletType === 'protection')).toBe(true);

      const profitWallets = repo.findByType('profit');
      expect(profitWallets).toHaveLength(1);
      expect(profitWallets[0].walletType).toBe('profit');
    });
  });

  describe('findProfitWallet', () => {
    it('should find profit wallet', () => {
      repo.create({ alias: 'prot', address: '0xa', walletType: 'protection' });
      repo.create({ alias: 'prof', address: '0xb', walletType: 'profit' });

      const profit = repo.findProfitWallet();
      expect(profit).toBeDefined();
      expect(profit!.walletType).toBe('profit');
      expect(profit!.alias).toBe('prof');
    });
  });

  describe('updateBalance', () => {
    it('should update balance fields', () => {
      const wallet = repo.create({
        alias: 'balance-test',
        address: '0xaaa',
        walletType: 'protection',
      });

      expect(wallet.balanceAvailable).toBeUndefined();
      expect(wallet.balanceMarginUsed).toBeUndefined();
      expect(wallet.balanceTotal).toBeUndefined();

      repo.updateBalance(wallet.id, {
        available: '500',
        marginUsed: '100',
        total: '600',
        isLow: false,
      });

      const updated = repo.findById(wallet.id)!;
      expect(updated.balanceAvailable).toBe('500');
      expect(updated.balanceMarginUsed).toBe('100');
      expect(updated.balanceTotal).toBe('600');
      expect(updated.lastBalanceCheck).toBeGreaterThan(0);
    });
  });

  describe('delete', () => {
    it('should remove wallet', () => {
      const wallet = repo.create({
        alias: 'to-delete',
        address: '0xdead',
        walletType: 'protection',
      });

      expect(repo.findById(wallet.id)).toBeDefined();

      repo.delete(wallet.id);

      expect(repo.findById(wallet.id)).toBeUndefined();
    });
  });
});
