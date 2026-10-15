import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Dynamically detects the actual phone brand (e.g. Samsung, Realme, Apple, Xiaomi, Oppo, Vivo).
 * Falls back to platform constants or OS name if hardware brand is inaccessible.
 */
export function getPhoneBrand(): string {
  // 1. Check expo-device brand
  try {
    if (Device.brand && typeof Device.brand === 'string' && Device.brand.trim().length > 0) {
      const b = Device.brand.trim();
      return b.charAt(0).toUpperCase() + b.slice(1);
    }
  } catch {}

  // 2. Check expo-device manufacturer
  try {
    if (Device.manufacturer && typeof Device.manufacturer === 'string' && Device.manufacturer.trim().length > 0) {
      const m = Device.manufacturer.trim();
      return m.charAt(0).toUpperCase() + m.slice(1);
    }
  } catch {}

  // 3. Check React Native Android Platform.constants
  if (Platform.OS === 'android') {
    try {
      const constants = Platform.constants as any;
      const raw = constants?.Brand || constants?.Manufacturer;
      if (raw && typeof raw === 'string' && raw.trim().length > 0) {
        const b = raw.trim();
        return b.charAt(0).toUpperCase() + b.slice(1);
      }
    } catch {}
    return 'Android';
  }

  // 4. iOS
  if (Platform.OS === 'ios') {
    return 'Apple';
  }

  return 'Mobile';
}

/**
 * Returns formatted label for this device: "This device (Brand)"
 * e.g., "This device (Samsung)" or "This device (Realme)"
 */
export function getThisDeviceLabel(): string {
  const brand = getPhoneBrand();
  return `This device (${brand})`;
}
