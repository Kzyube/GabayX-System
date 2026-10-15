/**
 * GabayX Mobile - Real-time Disaster Alert & Two-Way Command Messaging Service
 * Connects to the GabayX Render Socket.io backend to receive:
 * 1. Live community disaster broadcasts.
 * 2. Targeted private direct replies from MDRRMO Dispatch to this specific device.
 */

import { io, Socket } from 'socket.io-client';
import { Vibration } from 'react-native';
import { DisasterAlert } from '../types/alert';
import { getResidentDeviceId } from '../utils/deviceIdentity';
import { GCashVoucher, CreateDonationInput, ReliefSupply } from '../types/voucher';
import { voucherRepository } from '../database/voucherRepository';
import { soundService } from './soundService';

const DEFAULT_API_BASE = 'https://gabayx-system.onrender.com';

export interface AdminReplyMessage {
  message: string;
  sender: string;
  timestamp: string;
}

export type ResidentStatus = 'SAFE' | 'DANGER';
export type ResidentStatusListener = (status: ResidentStatus) => void;
export type VoucherListener = (voucher: GCashVoucher) => void;
export type SupplyListener = (supplies: ReliefSupply[]) => void;

type AlertListener = (alert: DisasterAlert) => void;
type ClearListener = () => void;
type StatusListener = (connected: boolean) => void;
type ReplyListener = (reply: AdminReplyMessage) => void;

class AlertService {
  private socket: Socket | null = null;
  private alertListeners: Set<AlertListener> = new Set();
  private clearListeners: Set<ClearListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private replyListeners: Set<ReplyListener> = new Set();
  private residentStatusListeners: Set<ResidentStatusListener> = new Set();
  private voucherListeners: Set<VoucherListener> = new Set();
  private supplyListeners: Set<SupplyListener> = new Set();
  private isConnected: boolean = false;
  private currentAlert: DisasterAlert | null = null;
  private currentResidentStatus: ResidentStatus = 'SAFE';
  private activeSupplies: ReliefSupply[] = [];
  private residentId: string | null = null;
  private heartbeatTimer: any = null;

  getSocket(): Socket | null {
    return this.socket;
  }

  getResidentId(): string | null {
    return this.residentId;
  }

  getResidentStatus(): ResidentStatus {
    return this.currentResidentStatus;
  }

  subscribeResidentStatus(listener: ResidentStatusListener): () => void {
    this.residentStatusListeners.add(listener);
    listener(this.currentResidentStatus);
    return () => this.residentStatusListeners.delete(listener);
  }

  /**
   * Connect to Render Socket.io server and register unique device room
   */
  async connect(apiBase: string = DEFAULT_API_BASE): Promise<void> {
    if (this.socket) {
      return;
    }

    this.residentId = await getResidentDeviceId();

    try {
      this.socket = io(apiBase, {
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
      });

      const emitRegistration = () => {
        if (this.socket && this.residentId) {
          this.socket.emit('register-student', this.residentId);
          this.socket.emit('register-resident', this.residentId);
          this.socket.emit('student-status', {
            id: this.residentId,
            status: this.currentResidentStatus,
            lat: null,
            lng: null,
            accuracy: 10,
          });
        }
      };

      this.socket.on('connect', () => {
        console.log('[AlertService] Socket connected to Render backend:', this.socket?.id);
        this.isConnected = true;
        this.notifyStatus(true);

        // Register unique resident device room with server so replies reach ONLY this device
        emitRegistration();

        // Guaranteed retry bursts in case backend was initializing
        setTimeout(emitRegistration, 500);
        setTimeout(emitRegistration, 1500);
        setTimeout(emitRegistration, 3000);
      });

      // Maintain persistent heartbeat registration so rooms remain active indefinitely
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(emitRegistration, 8000);

      this.socket.on('disconnect', (reason) => {
        console.log('[AlertService] Socket disconnected:', reason);
        this.isConnected = false;
        this.notifyStatus(false);
      });

      this.socket.on('connect_error', (err) => {
        console.log('[AlertService] Socket connection error:', err?.message);
        this.isConnected = false;
        this.notifyStatus(false);
      });

      // 1. Listen for incoming community-wide disaster broadcasts from MDRRMO
      this.socket.on('receive-alert', async (data: any) => {
        console.log('[AlertService] Broadcast received:', data);
        if (!data || !data.type) return;

        const type = String(data.type).toUpperCase();
        if (type === 'SAFE' || type === 'CLEAR') {
          this.currentAlert = null;
          soundService.stopEmergencySiren();
          this.notifyClear();
        } else if (type === 'SUPPLY') {
          // Relief Supply marked by admin: strictly a map marking without any evacuation route
          console.log('[AlertService] Relief supply point marked by admin:', data);
          if (data.lat && data.lng) {
            const newSupply: ReliefSupply = {
              id: String(data.id || Date.now()),
              latitude: parseFloat(data.lat),
              longitude: parseFloat(data.lng),
              message: data.message || 'Relief supplies available here.',
              createdAt: new Date().toISOString(),
            };
            await voucherRepository.saveSupply(newSupply);
            this.activeSupplies = [newSupply, ...this.activeSupplies.filter((s) => s.id !== newSupply.id)];
            this.notifySupplies(this.activeSupplies);
            try {
              Vibration.vibrate(150);
            } catch {}
            soundService.playNotificationChime();
          }
          return;
        } else {
          const alertObj: DisasterAlert = {
            type: data.type,
            message: data.message || `EMERGENCY: ${data.type} declared. Proceed to the nearest municipal safe zone.`,
            lat: data.lat || null,
            lng: data.lng || null,
            createdAt: new Date().toISOString(),
          };
          this.currentAlert = alertObj;

          try {
            Vibration.vibrate([0, 600, 250, 600, 250, 600]);
          } catch {
            // Fallback
          }

          // Trigger audible emergency siren loop (not just vibration)
          soundService.playEmergencySiren(8000);

          this.notifyAlert(alertObj);
        }
      });

      // 2. Listen for targeted private reply from MDRRMO Dispatch to this user
      this.socket.on('receive-reply', (data: any) => {
        console.log('[AlertService] Private dispatch message received:', data);
        if (!data) return;
        const msgText = typeof data === 'string' ? data : (data.message || JSON.stringify(data));
        if (!msgText) return;

        try {
          Vibration.vibrate([0, 500, 250, 500, 250, 500]);
        } catch {
          // Fallback
        }

        soundService.playNotificationChime();

        const replyObj: AdminReplyMessage = {
          message: msgText,
          sender: (typeof data === 'object' && data.sender) ? data.sender : 'MDRRMO Central Dispatch',
          timestamp: (typeof data === 'object' && data.timestamp) ? data.timestamp : new Date().toISOString(),
        };

        this.notifyReply(replyObj);
      });

      // 3. Listen for incoming live GCash relief donation vouchers beamed to residents
      this.socket.on('donation-dropped', async (data: any) => {
        console.log('[AlertService] Incoming GCash relief donation voucher:', data);
        if (!data || (!data.voucher && !data.voucher_code)) return;

        try {
          Vibration.vibrate([0, 200, 100, 200]);
        } catch {}

        soundService.playNotificationChime();

        const voucherObj = await voucherRepository.saveVoucher({
          voucherCode: data.voucher || data.voucher_code,
          amount: parseFloat(data.amount) || 0,
          personsCount: parseInt(data.persons_count) || Math.max(1, Math.round((parseFloat(data.amount) || 0) / 250)),
          donorName: data.donor || data.donor_name || 'Community Donor',
          targetZone: data.zone || data.target_zone || 'ALL ZONES',
          createdAt: data.created_at || new Date().toISOString(),
        });

        this.notifyVoucher(voucherObj);
      });

      // 4. Listen for relief supply removals by admin
      this.socket.on('supply-removed', async (data: any) => {
        if (!data || !data.id) return;
        const idStr = String(data.id);
        await voucherRepository.removeSupply(idStr);
        this.activeSupplies = this.activeSupplies.filter((s) => s.id !== idStr);
        this.notifySupplies(this.activeSupplies);
      });
    } catch (err) {
      console.error('[AlertService] Failed to initialize socket:', err);
    }
  }

  /**
   * Emit emergency report directly over real-time socket
   */
  emitEmergencyReport(report: {
    id: string;
    incident_type: string;
    description: string;
    nearest_building?: string;
    lat?: number | null;
    lng?: number | null;
    student_name?: string;
  }): void {
    if (!this.socket || !this.residentId) return;

    this.socket.emit('register-student', this.residentId);
    this.socket.emit('register-resident', this.residentId);

    const payload = {
      id: report.id,
      student_id: this.residentId,
      student_name: report.student_name || `Resident (${this.residentId.slice(-4)})`,
      incident_type: report.incident_type,
      description: report.description,
      nearest_building: report.nearest_building || 'Central Poblacion',
      lat: report.lat || null,
      lng: report.lng || null,
      timestamp: new Date().toISOString(),
    };

    // Forward through socket events
    this.socket.emit('student-note', {
      id: this.residentId,
      message: `[${report.incident_type}]: ${report.description}`,
    });
    this.socket.emit('student-status', {
      id: this.residentId,
      status: 'DANGER',
      lat: report.lat || null,
      lng: report.lng || null,
      accuracy: 10,
    });
    this.currentResidentStatus = 'DANGER';
    this.notifyResidentStatus('DANGER');
  }

  /**
   * Update resident emergency status ('SAFE' or 'DANGER')
   * Mirrors PWA markAsSafe() and markAsDanger() logic
   */
  async updateResidentStatus(
    status: ResidentStatus,
    coords?: { latitude: number; longitude: number } | null,
    accuracy: number = 10
  ): Promise<void> {
    this.currentResidentStatus = status;
    this.notifyResidentStatus(status);

    if (!this.residentId) {
      this.residentId = await getResidentDeviceId();
    }

    if (this.socket && this.residentId) {
      this.socket.emit('register-student', this.residentId);
      this.socket.emit('register-resident', this.residentId);

      this.socket.emit('student-status', {
        id: this.residentId,
        status: status,
        lat: coords ? coords.latitude : null,
        lng: coords ? coords.longitude : null,
        accuracy: accuracy,
      });

      if (status === 'DANGER') {
        this.socket.emit('student-note', {
          id: this.residentId,
          message: `[EMERGENCY SOS]: Resident declared DANGER status at ${new Date().toLocaleTimeString()}`,
        });
      } else {
        this.socket.emit('student-note', {
          id: this.residentId,
          message: `[STATUS]: Resident marked SAFE at ${new Date().toLocaleTimeString()}`,
        });
      }
      console.log(`[AlertService] Dispatched student-status '${status}' for ${this.residentId}`);
    } else {
      console.log(`[AlertService] Socket offline. Status updated locally as: ${status}`);
    }
  }

  /**
   * Fetch latest active disaster from REST API on app startup
   */
  async fetchActiveDisaster(apiBase: string = DEFAULT_API_BASE): Promise<DisasterAlert | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${apiBase}/api/disaster-history`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const history = await res.json();

      if (Array.isArray(history) && history.length > 0) {
        const latest = history[0];
        const latestType = String(latest.type || '').toUpperCase();

        if (latestType && latestType !== 'SAFE' && latestType !== 'CLEAR' && latestType !== 'SUPPLY') {
          const alertObj: DisasterAlert = {
            type: latest.type,
            message: latest.instructions || `Active ${latest.type} emergency reported.`,
            lat: latest.lat || null,
            lng: latest.lng || null,
            createdAt: latest.created_at || new Date().toISOString(),
          };
          this.currentAlert = alertObj;
          return alertObj;
        }
      }

      this.currentAlert = null;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Submit GCash donation from the phone
   */
  async submitDonation(
    params: CreateDonationInput,
    apiBase: string = DEFAULT_API_BASE
  ): Promise<GCashVoucher> {
    const payload = {
      donor_name: params.donorName || 'Community Donor',
      amount: params.amount,
      persons_count: params.personsCount,
      target_zone: params.targetZone || 'ALL ZONES',
      target_lat: params.targetLat || null,
      target_lng: params.targetLng || null,
    };

    // Try socket first if connected
    if (this.socket && this.socket.connected) {
      this.socket.emit('submit-donation', payload);
    }

    // Also attempt REST call to ensure database persistence
    try {
      const res = await fetch(`${apiBase}/api/donate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.voucher) {
          return await voucherRepository.saveVoucher({
            voucherCode: json.voucher,
            amount: json.amount,
            personsCount: json.persons_count,
            donorName: json.donor,
            targetZone: json.zone,
            createdAt: json.created_at,
          });
        }
      }
    } catch (e) {
      console.warn('[AlertService] REST donate error:', e);
    }

    // Offline / fallback simulated voucher code
    const fallbackCode = 'GX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    return await voucherRepository.saveVoucher({
      voucherCode: fallbackCode,
      amount: params.amount,
      personsCount: params.personsCount,
      donorName: params.donorName || 'Community Donor',
      targetZone: params.targetZone || 'ALL ZONES',
    });
  }

  /**
   * Fetch active relief supplies from database and API
   */
  async fetchActiveSupplies(apiBase: string = DEFAULT_API_BASE): Promise<ReliefSupply[]> {
    try {
      // 1. Read SQLite stored supplies first
      const local = await voucherRepository.getAllSupplies();
      if (local.length > 0) {
        this.activeSupplies = local;
        this.notifySupplies(this.activeSupplies);
      }

      // 2. Fetch fresh supplies from REST API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${apiBase}/api/supplies`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const suppliesData = await res.json();
        if (Array.isArray(suppliesData)) {
          const freshList: ReliefSupply[] = [];
          for (const s of suppliesData) {
            if (s.lat && s.lng) {
              const item: ReliefSupply = {
                id: String(s.id || s.created_at || Math.random()),
                latitude: parseFloat(s.lat),
                longitude: parseFloat(s.lng),
                message: s.instructions || s.message || 'Relief supplies available here.',
                createdAt: s.created_at || new Date().toISOString(),
              };
              await voucherRepository.saveSupply(item);
              freshList.push(item);
            }
          }
          if (freshList.length > 0) {
            this.activeSupplies = freshList;
            this.notifySupplies(this.activeSupplies);
          }
        }
      }
    } catch (err) {
      console.warn('[AlertService] Error fetching supplies:', err);
    }
    return this.activeSupplies;
  }

  getActiveSupplies(): ReliefSupply[] {
    return this.activeSupplies;
  }

  subscribeVoucher(listener: VoucherListener): () => void {
    this.voucherListeners.add(listener);
    return () => this.voucherListeners.delete(listener);
  }

  subscribeSupplies(listener: SupplyListener): () => void {
    this.supplyListeners.add(listener);
    if (this.activeSupplies.length > 0) {
      listener(this.activeSupplies);
    }
    return () => this.supplyListeners.delete(listener);
  }

  private notifyVoucher(voucher: GCashVoucher) {
    this.voucherListeners.forEach((l) => {
      try {
        l(voucher);
      } catch (e) {
        console.error('[AlertService] Error in voucherListener:', e);
      }
    });
  }

  private notifySupplies(supplies: ReliefSupply[]) {
    this.supplyListeners.forEach((l) => {
      try {
        l(supplies);
      } catch (e) {
        console.error('[AlertService] Error in supplyListener:', e);
      }
    });
  }

  getCurrentAlert(): DisasterAlert | null {
    return this.currentAlert;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  subscribeAlert(listener: AlertListener): () => void {
    this.alertListeners.add(listener);
    if (this.currentAlert) {
      listener(this.currentAlert);
    }
    return () => this.alertListeners.delete(listener);
  }

  subscribeClear(listener: ClearListener): () => void {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.isConnected);
    return () => this.statusListeners.delete(listener);
  }

  subscribeReply(listener: ReplyListener): () => void {
    this.replyListeners.add(listener);
    return () => this.replyListeners.delete(listener);
  }

  private notifyAlert(alert: DisasterAlert) {
    this.alertListeners.forEach((l) => {
      try {
        l(alert);
      } catch (e) {
        console.error(e);
      }
    });
  }

  private notifyClear() {
    this.clearListeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    });
  }

  private notifyStatus(connected: boolean) {
    this.statusListeners.forEach((l) => {
      try {
        l(connected);
      } catch (e) {
        console.error(e);
      }
    });
  }

  private notifyReply(reply: AdminReplyMessage) {
    this.replyListeners.forEach((l) => {
      try {
        l(reply);
      } catch (e) {
        console.error(e);
      }
    });
  }

  private notifyResidentStatus(status: ResidentStatus) {
    this.residentStatusListeners.forEach((l) => {
      try {
        l(status);
      } catch (e) {
        console.error('[AlertService] Error in residentStatusListener:', e);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.notifyStatus(false);
    }
  }
}

export const alertService = new AlertService();
