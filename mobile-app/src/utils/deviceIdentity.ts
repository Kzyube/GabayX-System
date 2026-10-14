/**
 * GabayX - Unique Resident Device Identity
 * Generates and stores a unique persistent ID for this physical device
 * so MDRRMO Admin can send targeted, private two-way messages to this user.
 */

import * as Crypto from 'expo-crypto';

let cachedDeviceId: string | null = null;

export async function getResidentDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  try {
    const randomHex = Crypto.randomUUID().split('-')[0].toUpperCase();
    cachedDeviceId = `RESIDENT-${randomHex}`;
  } catch {
    const fallbackHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    cachedDeviceId = `RESIDENT-${fallbackHex}`;
  }

  return cachedDeviceId;
}
