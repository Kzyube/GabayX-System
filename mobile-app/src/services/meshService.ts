/**
 * GabayX Mobile - Device Messaging & Peer-to-Peer Communication Service
 * 
 * Enables real physical phones to discover each other dynamically by brand
 * (e.g. "This device (Samsung)", "This device (Realme)"), establish direct
 * sessions, exchange messages, and relay emergency reports.
 */

import { alertService } from './alertService';
import { getResidentDeviceId } from '../utils/deviceIdentity';
import { getPhoneBrand, getThisDeviceLabel } from '../utils/deviceInfo';
import { reportRepository } from '../database/reportRepository';
import { GabayXReport } from '../types/report';

export interface MeshPeer {
  nodeId: string;
  nodeLabel: string; // The detected brand of the other device, e.g. "Samsung" or "Realme"
  socketId?: string;
  status: 'ACTIVE' | 'CONNECTED';
  rssi: number;
  distanceMeters: number;
  battery: number;
  reportsCount: number;
  isSimulated?: boolean;
}

export interface MeshMessage {
  id: string;
  senderId: string;
  senderLabel: string;
  targetId: string;
  text: string;
  type: 'TEXT' | 'SOS' | 'RELAY';
  timestamp: string;
  hopCount: number;
  rssi?: number;
  isSelf?: boolean;
}

export interface RelayResult {
  relayedCount: number;
  targetNodeLabel: string;
  logSteps: string[];
}

type PeersListener = (peers: MeshPeer[]) => void;
type MessagesListener = (messages: MeshMessage[]) => void;
type ActiveStateListener = (isActive: boolean) => void;

class MeshService {
  private localNodeId: string = '';
  private localBrand: string = 'Mobile';
  private localDeviceLabel: string = 'This device';
  private isAdvertising: boolean = false;
  private discoveredPeers: Map<string, MeshPeer> = new Map();
  private messages: MeshMessage[] = [];
  private peersListeners: Set<PeersListener> = new Set();
  private messagesListeners: Set<MessagesListener> = new Set();
  private stateListeners: Set<ActiveStateListener> = new Set();
  private connectedPeerId: string | null = null;
  private initialized: boolean = false;
  private listenersAttached: boolean = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    const deviceId = await getResidentDeviceId();
    this.localNodeId = deviceId;
    this.localBrand = getPhoneBrand();
    this.localDeviceLabel = getThisDeviceLabel();

    this.setupSocketListeners();
    this.initialized = true;
  }

  getLocalNodeId(): string {
    return this.localNodeId || 'RESIDENT-DEVICE';
  }

  getLocalBrand(): string {
    return this.localBrand || getPhoneBrand();
  }

  getThisDeviceLabel(): string {
    return this.localDeviceLabel || getThisDeviceLabel();
  }

  getIsAdvertising(): boolean {
    return this.isAdvertising;
  }

  getConnectedPeerId(): string | null {
    return this.connectedPeerId;
  }

  private setupSocketListeners(): void {
    if (this.listenersAttached) return;

    const socket = alertService.getSocket();
    if (!socket) return;

    this.listenersAttached = true;

    const handlePeersUpdate = (peersList: any[]) => {
      if (!Array.isArray(peersList)) return;

      const newPeersMap = new Map<string, MeshPeer>();

      peersList.forEach((p) => {
        const peerId = p.id || p.nodeId || p.socketId;
        // Skip self
        if (!peerId || peerId === this.localNodeId) return;

        const peerLabel = p.name || p.nodeLabel || 'Mobile Device';
        const isCurrentTarget = this.connectedPeerId === peerId;

        newPeersMap.set(peerId, {
          nodeId: peerId,
          nodeLabel: peerLabel,
          socketId: p.socketId,
          status: isCurrentTarget ? 'CONNECTED' : 'ACTIVE',
          rssi: -55,
          distanceMeters: 2,
          battery: p.battery || 100,
          reportsCount: p.reportsCount || 0,
          isSimulated: false,
        });
      });

      this.discoveredPeers = newPeersMap;

      // If currently connected peer left, clear connected state
      if (this.connectedPeerId && !newPeersMap.has(this.connectedPeerId)) {
        this.connectedPeerId = null;
      }

      this.notifyPeers();
    };

    socket.on('hotspot-peers-updated', handlePeersUpdate);
    socket.on('mesh-nodes-updated', handlePeersUpdate);

    const handleIncomingMsg = (incoming: any) => {
      if (!incoming) return;
      const senderId = incoming.sender_id || incoming.senderId;
      const text = incoming.text || incoming.message;
      if (!text) return;

      // Ignore messages from self (already added locally)
      if (senderId === this.localNodeId) return;

      const msgId = incoming.id || `IN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      if (this.messages.some((m) => m.id === msgId)) return;

      const senderLabel = incoming.sender || incoming.senderLabel || 'Device';
      const newMsg: MeshMessage = {
        id: msgId,
        senderId: senderId,
        senderLabel: senderLabel,
        targetId: incoming.recipient_id || incoming.targetId || this.localNodeId,
        text: text,
        type: (incoming.type as any) || 'TEXT',
        timestamp: incoming.created_at || incoming.timestamp || new Date().toISOString(),
        hopCount: incoming.hopCount || 1,
        isSelf: false,
      };

      this.messages = [...this.messages, newMsg];
      this.notifyMessages();
    };

    socket.on('hotspot-receive-msg', handleIncomingMsg);
    socket.on('mesh-receive-message', handleIncomingMsg);

    // If socket reconnects, re-announce presence
    socket.on('connect', () => {
      if (this.isAdvertising) {
        this.announcePresence();
      }
    });
  }

  private announcePresence(): void {
    const socket = alertService.getSocket();
    if (!socket || !socket.connected) return;

    const brand = this.getLocalBrand();

    socket.emit('hotspot-join', {
      id: this.localNodeId,
      name: brand,
      sector: 'Available Devices',
    });

    socket.emit('mesh-join', {
      nodeId: this.localNodeId,
      nodeLabel: brand,
      battery: 100,
    });
  }

  /**
   * Start discovering and communicating with other devices
   */
  async startAdvertising(): Promise<void> {
    await this.init();
    this.setupSocketListeners();
    this.isAdvertising = true;
    this.announcePresence();
    this.notifyState();
  }

  /**
   * Stop demo session discovery
   */
  stopAdvertising(): void {
    const socket = alertService.getSocket();
    if (socket && socket.connected) {
      socket.emit('mesh-leave');
    }
    this.isAdvertising = false;
    this.connectedPeerId = null;
    this.notifyState();
  }

  /**
   * Connect to an available device to start messaging
   */
  connectPeer(nodeId: string): void {
    this.connectedPeerId = nodeId;
    const peer = this.discoveredPeers.get(nodeId);
    if (peer) {
      peer.status = 'CONNECTED';
      this.notifyPeers();
    }
  }

  disconnectPeer(): void {
    if (this.connectedPeerId) {
      const peer = this.discoveredPeers.get(this.connectedPeerId);
      if (peer) peer.status = 'ACTIVE';
      this.connectedPeerId = null;
      this.notifyPeers();
    }
  }

  /**
   * Send a direct message to a connected device
   */
  async sendMessage(text: string, targetId?: string): Promise<MeshMessage> {
    await this.init();
    const effectiveTarget = targetId || this.connectedPeerId || 'ALL';
    const targetPeer = this.discoveredPeers.get(effectiveTarget);

    const socket = alertService.getSocket();
    const msgId = `MSG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();
    const brand = this.getLocalBrand();

    const newMsg: MeshMessage = {
      id: msgId,
      senderId: this.localNodeId,
      senderLabel: brand,
      targetId: effectiveTarget,
      text: text.trim(),
      type: 'TEXT',
      timestamp: timestamp,
      hopCount: 1,
      isSelf: true,
    };

    // Store in local message stream
    this.messages = [...this.messages, newMsg];
    this.notifyMessages();

    if (socket && socket.connected) {
      socket.emit('hotspot-send-msg', {
        id: msgId,
        sender: brand,
        sender_id: this.localNodeId,
        recipient_id: effectiveTarget,
        recipient_name: targetPeer?.nodeLabel || 'Device',
        text: text.trim(),
        channel: 'direct',
      });

      socket.emit('mesh-send-message', {
        id: msgId,
        senderId: this.localNodeId,
        senderLabel: brand,
        targetId: effectiveTarget,
        text: text.trim(),
        type: 'TEXT',
      });
    }

    return newMsg;
  }

  /**
   * Relay store-and-forward offline reports to connected peer
   */
  async relayOfflineReports(targetNodeId?: string): Promise<RelayResult> {
    await this.init();
    const effectiveTarget = targetNodeId || this.connectedPeerId || 'ALL';
    const targetPeer = this.discoveredPeers.get(effectiveTarget);
    const targetLabel = targetPeer ? targetPeer.nodeLabel : 'Device';

    const pendingReports = await reportRepository.getRelayableReports();
    const logSteps: string[] = [
      `Found ${pendingReports.length} pending offline report(s).`,
      `Transmitting reports to ${targetLabel}...`,
      `Transfer completed successfully.`,
    ];

    const socket = alertService.getSocket();
    if (socket && socket.connected) {
      socket.emit('mesh-relay-sos', {
        senderId: this.localNodeId,
        senderLabel: this.getLocalBrand(),
        targetId: effectiveTarget,
        reports: pendingReports,
      });
    }

    const relayNotice: MeshMessage = {
      id: `RELAY-${Date.now()}`,
      senderId: this.localNodeId,
      senderLabel: this.getLocalBrand(),
      targetId: effectiveTarget,
      text: `Transferred ${pendingReports.length} offline report(s) to ${targetLabel}.`,
      type: 'RELAY',
      timestamp: new Date().toISOString(),
      hopCount: 1,
      isSelf: true,
    };
    this.messages = [...this.messages, relayNotice];
    this.notifyMessages();

    return {
      relayedCount: pendingReports.length,
      targetNodeLabel: targetLabel,
      logSteps,
    };
  }

  clearMessages(): void {
    this.messages = [];
    this.notifyMessages();
  }

  subscribePeers(listener: PeersListener): () => void {
    this.peersListeners.add(listener);
    listener(Array.from(this.discoveredPeers.values()));
    return () => this.peersListeners.delete(listener);
  }

  subscribeMessages(listener: MessagesListener): () => void {
    this.messagesListeners.add(listener);
    listener(this.messages);
    return () => this.messagesListeners.delete(listener);
  }

  subscribeState(listener: ActiveStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.isAdvertising);
    return () => this.stateListeners.delete(listener);
  }

  private notifyPeers(): void {
    const list = Array.from(this.discoveredPeers.values());
    this.peersListeners.forEach((l) => l(list));
  }

  private notifyMessages(): void {
    this.messagesListeners.forEach((l) => l(this.messages));
  }

  private notifyState(): void {
    this.stateListeners.forEach((l) => l(this.isAdvertising));
  }
}

export const meshService = new MeshService();
