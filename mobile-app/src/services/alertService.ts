/**
 * GabayX Mobile - Real-time Disaster Alert Service
 * Connects to the GabayX Render Socket.io backend to receive live disaster broadcasts.
 */

import { io, Socket } from 'socket.io-client';
import { Vibration } from 'react-native';
import { DisasterAlert } from '../types/alert';

const DEFAULT_API_BASE = 'https://gabayx-system.onrender.com';

type AlertListener = (alert: DisasterAlert) => void;
type ClearListener = () => void;
type StatusListener = (connected: boolean) => void;

class AlertService {
  private socket: Socket | null = null;
  private alertListeners: Set<AlertListener> = new Set();
  private clearListeners: Set<ClearListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private isConnected: boolean = false;
  private currentAlert: DisasterAlert | null = null;

  /**
   * Connect to Render Socket.io server
   */
  connect(apiBase: string = DEFAULT_API_BASE): void {
    if (this.socket) {
      return;
    }

    try {
      this.socket = io(apiBase, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
      });

      this.socket.on('connect', () => {
        console.log('[AlertService] Socket connected to Render backend:', this.socket?.id);
        this.isConnected = true;
        this.notifyStatus(true);
      });

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

      // Listen for incoming disaster broadcasts from Incident Command
      this.socket.on('receive-alert', (data: any) => {
        console.log('[AlertService] Broadcast received:', data);
        if (!data || !data.type) return;

        const type = String(data.type).toUpperCase();
        if (type === 'SAFE' || type === 'CLEAR') {
          this.currentAlert = null;
          this.notifyClear();
        } else {
          const alertObj: DisasterAlert = {
            type: data.type,
            message: data.message || `EMERGENCY: ${data.type} declared. Proceed to the nearest safe zone.`,
            lat: data.lat || null,
            lng: data.lng || null,
            createdAt: new Date().toISOString(),
          };
          this.currentAlert = alertObj;

          // Urgent emergency tactile vibration pattern
          try {
            Vibration.vibrate([0, 600, 250, 600, 250, 600]);
          } catch {
            // Non-critical vibration fallback
          }

          this.notifyAlert(alertObj);
        }
      });
    } catch (err) {
      console.error('[AlertService] Failed to initialize socket:', err);
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

        if (latestType && latestType !== 'SAFE' && latestType !== 'CLEAR') {
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
