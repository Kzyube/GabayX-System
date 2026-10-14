/**
 * GabayX Mobile - GCash Voucher & Relief Supply Types
 */

export interface GCashVoucher {
  id: string;
  voucherCode: string;
  amount: number;
  personsCount: number;
  donorName: string;
  targetZone: string;
  createdAt: string;
  isClaimed: boolean;
}

export interface CreateDonationInput {
  amount: number;
  personsCount: number;
  donorName?: string;
  targetZone?: string;
  targetLat?: number | null;
  targetLng?: number | null;
}

export interface ReliefSupply {
  id: string;
  latitude: number;
  longitude: number;
  message: string;
  createdAt: string;
}
