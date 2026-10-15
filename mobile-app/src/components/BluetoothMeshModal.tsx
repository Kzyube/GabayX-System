import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Vibration,
} from 'react-native';
import { meshService, MeshPeer, MeshMessage } from '../services/meshService';

interface BluetoothMeshModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BluetoothMeshModal: React.FC<BluetoothMeshModalProps> = ({ visible, onClose }) => {
  const [deviceLabel, setDeviceLabel] = useState<string>('This device');
  const [peers, setPeers] = useState<MeshPeer[]>([]);
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      meshService.init().then(() => {
        setDeviceLabel(meshService.getThisDeviceLabel());
        meshService.startAdvertising();
      });

      const unsubPeers = meshService.subscribePeers((p) => {
        setPeers(p);
      });

      const unsubMessages = meshService.subscribeMessages((m) => {
        setMessages(m);
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      });

      return () => {
        unsubPeers();
        unsubMessages();
      };
    } else {
      setSelectedPeerId(null);
      setInputText('');
    }
  }, [visible]);

  const activePeer = peers.find((p) => p.nodeId === selectedPeerId);

  const handleConnectDevice = (peer: MeshPeer) => {
    try {
      Vibration.vibrate(40);
    } catch {}
    meshService.connectPeer(peer.nodeId);
    setSelectedPeerId(peer.nodeId);
  };

  const handleBackToList = () => {
    meshService.disconnectPeer();
    setSelectedPeerId(null);
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      try {
        Vibration.vibrate(30);
      } catch {}
      await meshService.sendMessage(text, selectedPeerId || undefined);
      setInputText('');
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      console.warn('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Filter messages for active conversation
  const conversationMessages = messages.filter((m) => {
    if (!selectedPeerId) return true;
    return (
      (m.senderId === meshService.getLocalNodeId() && m.targetId === selectedPeerId) ||
      m.senderId === selectedPeerId
    );
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* TOP BAR */}
          <View style={styles.topBar}>
            <View style={styles.topBarTitleRow}>
              <Text style={styles.topBarTitle}>Messaging</Text>
              <View style={styles.statusIndicator}>
                <View style={styles.onlineDot} />
                <Text style={styles.statusText}>Connected</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Close Messaging"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* DYNAMIC DEVICE IDENTITY BANNER (Format: "This device (Samsung)") */}
          <View style={styles.deviceBanner}>
            <View style={styles.deviceBannerLeft}>
              <View style={styles.devicePulseDot} />
              <Text style={styles.deviceBannerText}>{deviceLabel}</Text>
            </View>
            <View style={styles.readyBadge}>
              <Text style={styles.readyBadgeText}>Active</Text>
            </View>
          </View>

          {/* MAIN CONTENT: AVAILABLE DEVICES LIST OR CHAT CONVERSATION */}
          {!selectedPeerId ? (
            /* --- STATE 1: AVAILABLE DEVICES LIST --- */
            <View style={styles.contentContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Available Devices</Text>
                {peers.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{peers.length} available</Text>
                  </View>
                )}
              </View>

              {peers.length === 0 ? (
                /* ELEGANT EMPTY STATE: "No phone connected" */
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyCircle}>
                    <Text style={styles.emptyIcon}>📱</Text>
                  </View>
                  <Text style={styles.emptyTitle}>No phone connected</Text>
                  <Text style={styles.emptySubtitle}>
                    Available devices will appear here automatically when connected.
                  </Text>
                </View>
              ) : (
                /* LIST OF DISCOVERED AVAILABLE DEVICES */
                <ScrollView style={styles.peersList} contentContainerStyle={styles.peersListContent}>
                  {peers.map((peer) => (
                    <TouchableOpacity
                      key={peer.nodeId}
                      style={styles.peerCard}
                      onPress={() => handleConnectDevice(peer)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.peerIconWrapper}>
                        <Text style={styles.peerCardIcon}>📱</Text>
                        <View style={styles.peerOnlineBadge} />
                      </View>

                      <View style={styles.peerInfo}>
                        <Text style={styles.peerName}>{peer.nodeLabel}</Text>
                        <View style={styles.peerStatusRow}>
                          <View style={styles.peerStatusDot} />
                          <Text style={styles.peerStatus}>Available to connect</Text>
                        </View>
                      </View>

                      <View style={styles.connectButton}>
                        <Text style={styles.connectButtonText}>Connect ›</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            /* --- STATE 2: CHAT CONVERSATION --- */
            <View style={styles.chatContainer}>
              {/* CHAT HEADER */}
              <View style={styles.chatHeader}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={handleBackToList}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backBtnText}>‹ Available Devices</Text>
                </TouchableOpacity>

                <View style={styles.chatPeerInfo}>
                  <Text style={styles.chatPeerName}>
                    {activePeer ? activePeer.nodeLabel : 'Device'}
                  </Text>
                  <View style={styles.chatPeerStatusRow}>
                    <View
                      style={[
                        styles.chatDot,
                        activePeer ? styles.chatDotOnline : styles.chatDotOffline,
                      ]}
                    />
                    <Text style={styles.chatPeerStatusText}>
                      {activePeer ? 'Connected' : 'Disconnected'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* MESSAGES LIST */}
              <ScrollView
                ref={chatScrollRef}
                style={styles.messagesScroll}
                contentContainerStyle={styles.messagesScrollContent}
              >
                {conversationMessages.length === 0 ? (
                  <View style={styles.chatEmptyState}>
                    <Text style={styles.chatEmptyText}>
                      No messages yet. Send a message to start conversation.
                    </Text>
                  </View>
                ) : (
                  conversationMessages.map((msg) => {
                    const isSelf = msg.isSelf;
                    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <View
                        key={msg.id}
                        style={[
                          styles.messageRow,
                          isSelf ? styles.messageRowSelf : styles.messageRowOther,
                        ]}
                      >
                        <View
                          style={[
                            styles.messageBubble,
                            isSelf ? styles.bubbleSelf : styles.bubbleOther,
                          ]}
                        >
                          {!isSelf && (
                            <Text style={styles.bubbleSender}>{msg.senderLabel}</Text>
                          )}
                          <Text
                            style={[
                              styles.messageText,
                              isSelf ? styles.messageTextSelf : styles.messageTextOther,
                            ]}
                          >
                            {msg.text}
                          </Text>
                          <Text
                            style={[
                              styles.messageTime,
                              isSelf ? styles.messageTimeSelf : styles.messageTimeOther,
                            ]}
                          >
                            {timeStr}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {/* INPUT BAR */}
              <View style={styles.inputBar}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type a message..."
                  placeholderTextColor="#94A3B8"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSendMessage}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    (!inputText.trim() || isSending) && styles.sendBtnDisabled,
                  ]}
                  onPress={handleSendMessage}
                  disabled={!inputText.trim() || isSending}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sendBtnText}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 5,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '700',
  },
  deviceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  deviceBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devicePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F766E',
  },
  deviceBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  readyBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  readyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 28,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  peersList: {
    flex: 1,
  },
  peersListContent: {
    paddingBottom: 24,
    gap: 10,
  },
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  peerIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
  },
  peerCardIcon: {
    fontSize: 20,
  },
  peerOnlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16A34A',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  peerInfo: {
    flex: 1,
  },
  peerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  peerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  peerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  peerStatus: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '500',
  },
  connectButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#0F766E',
  },
  connectButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  chatPeerInfo: {
    alignItems: 'flex-end',
  },
  chatPeerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  chatPeerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  chatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chatDotOnline: {
    backgroundColor: '#16A34A',
  },
  chatDotOffline: {
    backgroundColor: '#94A3B8',
  },
  chatPeerStatusText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesScrollContent: {
    padding: 16,
    paddingBottom: 20,
    gap: 10,
  },
  chatEmptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  chatEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  messageRowSelf: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleSelf: {
    backgroundColor: '#0F766E',
    borderBottomRightRadius: 3,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 3,
  },
  bubbleSender: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 3,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextSelf: {
    color: '#FFFFFF',
  },
  messageTextOther: {
    color: '#0F172A',
  },
  messageTime: {
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeSelf: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  messageTimeOther: {
    color: '#94A3B8',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
