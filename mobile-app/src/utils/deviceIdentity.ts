/**
 * GabayX - Unique Resident Device Identity
 * Generates and permanently stores a unique persistent ID in local SQLite for this physical device
 * so MDRRMO Admin can send targeted, private two-way messages to this user.
 */

import * as Crypto from 'expo-crypto';
import { getDatabase } from '../database';

let cachedDeviceId: string | null = null;

export async function getResidentDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'resident_device_id';"
    );
    if (row && row.value) {
      cachedDeviceId = row.value;
      return cachedDeviceId;
    }

    // Generate new permanent resident ID
    let randomHex: string;
    try {
      randomHex = Crypto.randomUUID().split('-')[0].toUpperCase();
    } catch {
      randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    const newId = `RESIDENT-${randomHex}`;

    await db.runAsync(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('resident_device_id', ?);",
      [newId]
    );

    cachedDeviceId = newId;
    return newId;
  } catch (err) {
    if (!cachedDeviceId) {
      const fallbackHex = Math.random().toString(36).substring(2, 6).toUpperCase();
      cachedDeviceId = `RESIDENT-${fallbackHex}`;
    }
    return cachedDeviceId;
  }
}
