/**
 * GabayX Mobile - Voucher & Relief Supply SQLite Repository
 */

import * as Crypto from 'expo-crypto';
import { getDatabase } from './index';
import { GCashVoucher, ReliefSupply } from '../types/voucher';

interface VoucherRow {
  id: string;
  voucher_code: string;
  amount: number;
  persons_count: number;
  donor_name: string;
  target_zone: string;
  created_at: string;
  is_claimed: number;
}

interface SupplyRow {
  id: string;
  latitude: number;
  longitude: number;
  message: string;
  created_at: string;
}

export class VoucherRepository {
  /**
   * Save a newly received voucher into SQLite
   */
  async saveVoucher(data: {
    voucherCode: string;
    amount: number;
    personsCount?: number;
    donorName?: string;
    targetZone?: string;
    createdAt?: string;
  }): Promise<GCashVoucher> {
    const db = await getDatabase();
    const id = Crypto.randomUUID();
    const now = data.createdAt || new Date().toISOString();
    const personsCount = data.personsCount || Math.max(1, Math.round(data.amount / 250));
    const donorName = data.donorName || 'Community Donor';
    const targetZone = data.targetZone || 'ALL ZONES';

    // Deduplicate voucher by voucher_code
    const existing = await db.getFirstAsync<VoucherRow>(
      'SELECT * FROM gcash_vouchers WHERE voucher_code = ?;',
      [data.voucherCode]
    );

    if (existing) {
      return {
        id: existing.id,
        voucherCode: existing.voucher_code,
        amount: existing.amount,
        personsCount: existing.persons_count,
        donorName: existing.donor_name,
        targetZone: existing.target_zone,
        createdAt: existing.created_at,
        isClaimed: existing.is_claimed === 1,
      };
    }

    await db.runAsync(
      `INSERT INTO gcash_vouchers (
        id, voucher_code, amount, persons_count, donor_name, target_zone, created_at, is_claimed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
      [id, data.voucherCode, data.amount, personsCount, donorName, targetZone, now]
    );

    return {
      id,
      voucherCode: data.voucherCode,
      amount: data.amount,
      personsCount,
      donorName,
      targetZone,
      createdAt: now,
      isClaimed: false,
    };
  }

  /**
   * Retrieve all saved vouchers (ordered by newest first)
   */
  async getAllVouchers(): Promise<GCashVoucher[]> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<VoucherRow>(
        'SELECT * FROM gcash_vouchers ORDER BY created_at DESC;'
      );

      return rows.map((r) => ({
        id: r.id,
        voucherCode: r.voucher_code,
        amount: r.amount,
        personsCount: r.persons_count,
        donorName: r.donor_name,
        targetZone: r.target_zone,
        createdAt: r.created_at,
        isClaimed: r.is_claimed === 1,
      }));
    } catch (err) {
      console.warn('[VoucherRepository] Error getting vouchers:', err);
      return [];
    }
  }

  /**
   * Mark a voucher as claimed
   */
  async markClaimed(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE gcash_vouchers SET is_claimed = 1 WHERE id = ?;',
        [id]
      );
    } catch (err) {
      console.warn('[VoucherRepository] Error marking voucher claimed:', err);
    }
  }

  /**
   * Get unclaimed voucher count
   */
  async getUnclaimedCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM gcash_vouchers WHERE is_claimed = 0;'
      );
      return row ? row.count : 0;
    } catch {
      return 0;
    }
  }

  // --- RELIEF SUPPLIES PERSISTENCE ---

  /**
   * Save a relief supply point marked by admin
   */
  async saveSupply(supply: ReliefSupply): Promise<void> {
    try {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT OR REPLACE INTO relief_supplies (
          id, latitude, longitude, message, created_at
        ) VALUES (?, ?, ?, ?, ?);`,
        [supply.id, supply.latitude, supply.longitude, supply.message, supply.createdAt]
      );
    } catch (err) {
      console.warn('[VoucherRepository] Error saving supply point:', err);
    }
  }

  /**
   * Get all stored relief supplies
   */
  async getAllSupplies(): Promise<ReliefSupply[]> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<SupplyRow>(
        'SELECT * FROM relief_supplies ORDER BY created_at DESC;'
      );
      return rows.map((r) => ({
        id: r.id,
        latitude: r.latitude,
        longitude: r.longitude,
        message: r.message,
        createdAt: r.created_at,
      }));
    } catch (err) {
      console.warn('[VoucherRepository] Error getting supplies:', err);
      return [];
    }
  }

  /**
   * Remove a supply point by ID
   */
  async removeSupply(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM relief_supplies WHERE id = ?;', [id]);
    } catch (err) {
      console.warn('[VoucherRepository] Error removing supply:', err);
    }
  }
}

export const voucherRepository = new VoucherRepository();
