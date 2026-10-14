import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { GabayXReport, CreateReportInput } from './src/types/report';
import { reportRepository } from './src/database/reportRepository';
import { CreateReportModal } from './src/components/CreateReportModal';
import { ReportDetailModal } from './src/components/ReportDetailModal';
import { MapScreen } from './src/screens/MapScreen';
import { syncService } from './src/sync/syncService';
import { alertService, AdminReplyMessage } from './src/services/alertService';
import { DisasterAlert } from './src/types/alert';
import { DisasterAlertBanner } from './src/components/DisasterAlertBanner';
import { getResidentDeviceId } from './src/utils/deviceIdentity';

const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
  MEDICAL: { icon: '🚑', color: '#ef4444' },
  FIRE: { icon: '🔥', color: '#f97316' },
  FLOOD: { icon: '🌊', color: '#0284c7' },
  EARTHQUAKE: { icon: '🏚️', color: '#d97706' },
  TRAPPED: { icon: '🆘', color: '#dc2626' },
  HAZARD: { icon: '⚠️', color: '#eab308' },
  GENERAL: { icon: '📢', color: '#10b981' },
};

export default function App() {
  const [reports, setReports] = useState<GabayXReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<'REPORTS' | 'MAP'>('REPORTS');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING'>('ALL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Device identity
  const [residentDeviceId, setResidentDeviceId] = useState<string>('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<GabayXReport | null>(null);
  const [isReplyModalVisible, setIsReplyModalVisible] = useState(false);

  // Real-time Disaster Alerts from Central Command
  const [activeAlert, setActiveAlert] = useState<DisasterAlert | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [autoRouteRequested, setAutoRouteRequested] = useState(false);

  // Targeted private direct replies from MDRRMO Dispatch to this user
  const [adminReply, setAdminReply] = useState<AdminReplyMessage | null>(null);

  /**
   * Initialize device identity and Socket.io connection
   */
  useEffect(() => {
    getResidentDeviceId().then((id) => {
      setResidentDeviceId(id);
    });

    alertService.connect();

    // 1. Listen for community disaster broadcasts
    const unsubAlert = alertService.subscribeAlert((alert) => {
      setActiveAlert(alert);
      Alert.alert(
        `🚨 ${String(alert.type).toUpperCase()} BROADCAST`,
        `${alert.message}\n\nPlease proceed immediately along the designated municipal road route to the nearest Safe Hub.`,
        [
          {
            text: '🗺️ View Evacuation Route',
            onPress: () => {
              setAutoRouteRequested(true);
              setCurrentScreen('MAP');
            },
          },
          { text: 'Understood', style: 'cancel' },
        ]
      );
    });

    const unsubClear = alertService.subscribeClear(() => {
      setActiveAlert(null);
      Alert.alert(
        '🛡️ Incident All Clear',
        'MDRRMO Incident Command has marked the situation SAFE / ALL CLEAR.',
        [{ text: 'OK' }]
      );
    });

    const unsubStatus = alertService.subscribeStatus((connected) => {
      setIsSocketConnected(connected);
    });

    // 2. Listen for targeted private direct reply from MDRRMO Dispatch
    const unsubReply = alertService.subscribeReply((reply) => {
      setAdminReply(reply);
      setIsReplyModalVisible(true);
    });

    // Check on startup if an active disaster was already declared
    alertService.fetchActiveDisaster().then((existing) => {
      if (existing) {
        setActiveAlert(existing);
      }
    });

    return () => {
      unsubAlert();
      unsubClear();
      unsubStatus();
      unsubReply();
    };
  }, []);

  /**
   * Load reports from local SQLite database
   */
  const loadReports = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await reportRepository.getAllReports();
      setReports(data);
    } catch (err) {
      console.error('[App] Failed to load reports from database:', err);
      setErrorMessage('Could not load reports from local database.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  /**
   * Initialize database and load initial records on app launch
   */
  useEffect(() => {
    async function init() {
      try {
        await reportRepository.initStorage();
        await loadReports();
      } catch (err) {
        console.error('[App] Database initialization failed:', err);
        setErrorMessage('Database initialization failed. Please restart the app.');
        setIsLoading(false);
      }
    }
    init();
  }, [loadReports]);

  /**
   * Pull-to-refresh handler
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadReports();
  };

  /**
   * Handle server synchronization for pending reports
   */
  const handleSyncReports = async () => {
    setIsSyncing(true);
    try {
      const res = await syncService.syncPendingReports();
      await loadReports();
      if (res.syncedCount > 0) {
        Alert.alert(
          '✅ Synced to MDRRMO',
          `Successfully uploaded ${res.syncedCount} report(s) to MDRRMO Central Dispatch.`,
          [{ text: 'OK' }]
        );
      } else if (res.totalPending === 0) {
        Alert.alert('Up to Date', 'All reports are already synced with MDRRMO Dispatch.');
      } else {
        Alert.alert(
          'Saved on Device',
          'Could not reach server. Your reports remain safely stored on this phone and will sync automatically once connected.',
          [{ text: 'OK' }]
        );
      }
    } catch (err: any) {
      Alert.alert('Sync Notice', err?.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Handle emergency report creation:
   * 1. Saves to SQLite (guaranteed offline safety).
   * 2. Immediately dispatches via Socket.io.
   * 3. Immediately triggers background REST sync.
   */
  const handleCreateReport = async (data: CreateReportInput) => {
    try {
      const created = await reportRepository.createReport(data);
      console.log(`[App] Emergency report ${created.id} saved to SQLite.`);
      await loadReports();

      // Real-time socket emission
      alertService.emitEmergencyReport({
        id: created.id,
        incident_type: created.category,
        description: created.description,
        nearest_building: created.nearestBuilding,
        lat: created.latitude,
        lng: created.longitude,
        student_name: created.contactInformation.isAnonymous
          ? `Resident (${residentDeviceId ? residentDeviceId.slice(-4) : 'Mobile'})`
          : created.contactInformation.name || undefined,
      });

      // Immediate background sync attempt with REST backend
      syncService.syncPendingReports().then((res) => {
        if (res.syncedCount > 0) {
          loadReports();
        }
      }).catch((e) => console.log('[App] Auto-sync attempt:', e?.message));

      Alert.alert(
        '🚨 Incident Dispatched',
        'Your report has been saved on this phone and sent to MDRRMO Central Command.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      console.error('[App] Failed to save report:', err);
      throw err;
    }
  };

  /**
   * Handle deleting an unsent draft
   */
  const handleDeleteReport = async (id: string) => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report from your device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await reportRepository.deleteReport(id);
              await loadReports();
            } catch (err) {
              console.error('[App] Failed to delete report:', err);
              Alert.alert('Error', 'Failed to delete report.');
            }
          },
        },
      ]
    );
  };

  // Filter list by tab
  const displayedReports = reports.filter((r) => {
    if (activeTab === 'PENDING') {
      return r.localStatus === 'PENDING' || r.localStatus === 'FAILED';
    }
    return true;
  });

  const pendingCount = reports.filter(
    (r) => r.localStatus === 'PENDING' || r.localStatus === 'FAILED'
  ).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* HEADER BAR */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>GabayX</Text>
          <Text style={styles.brandSubtitle}>Municipality of Kabacan • MDRRMO</Text>
        </View>

        <View style={styles.headerRightGroup}>
          {/* Device ID Badge */}
          {residentDeviceId ? (
            <View style={styles.devicePill}>
              <Text style={styles.devicePillText}>📱 {residentDeviceId}</Text>
            </View>
          ) : null}

          {/* Connection Status Indicator */}
          <View style={styles.connectionBadge}>
            <View
              style={[
                styles.connectionDot,
                isSocketConnected ? styles.statusDotLive : styles.statusDotOffline,
              ]}
            />
            <Text style={styles.connectionText}>
              {isSocketConnected ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      {/* REAL-TIME DISASTER ALERT BANNER */}
      <DisasterAlertBanner
        alert={activeAlert}
        onPressViewMap={() => {
          setAutoRouteRequested(true);
          setCurrentScreen('MAP');
        }}
      />

      {/* TARGETED PRIVATE DIRECT MESSAGE FROM MDRRMO DISPATCH */}
      {adminReply && (
        <View style={styles.replyCard}>
          <View style={styles.replyCardHeader}>
            <View style={styles.replyTitleRow}>
              <Text style={styles.replyIcon}>📩</Text>
              <View>
                <Text style={styles.replySenderText}>{adminReply.sender}</Text>
                <Text style={styles.replyTimeText}>
                  Direct Message • {new Date(adminReply.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.replyDismissBtn}
              onPress={() => setAdminReply(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.replyDismissText}>Dismiss ✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.replyBodyText}>"{adminReply.message}"</Text>
        </View>
      )}

      {/* SCREEN CONTENT: REPORTS OR MAP */}
      {currentScreen === 'MAP' ? (
        <MapScreen
          initialAutoRoute={autoRouteRequested}
          onClearAutoRoute={() => setAutoRouteRequested(false)}
          activeDisaster={activeAlert}
        />
      ) : (
        <View style={styles.contentContainer}>
          {/* PROMINENT EMERGENCY ACTION HERO CARD */}
          <View style={styles.actionHeroContainer}>
            <TouchableOpacity
              style={styles.actionHeroCard}
              onPress={() => setIsCreateModalOpen(true)}
              activeOpacity={0.85}
            >
              <View style={styles.heroLeft}>
                <Text style={styles.heroIcon}>🚨</Text>
                <View>
                  <Text style={styles.heroTitle}>REPORT AN EMERGENCY</Text>
                  <Text style={styles.heroSub}>
                    Dispatches incident details & GPS directly to MDRRMO
                  </Text>
                </View>
              </View>
              <View style={styles.heroBtn}>
                <Text style={styles.heroBtnText}>+ REPORT</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* SECTION HEADER & SYNC CONTROLS */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Incident Reports</Text>
              <Text style={styles.sectionSub}>Stored safely in device SQLite storage</Text>
            </View>

            <View style={styles.controlsRight}>
              {/* Sync Button */}
              <TouchableOpacity
                style={[
                  styles.syncButton,
                  pendingCount > 0 && styles.syncBtnPending,
                ]}
                onPress={handleSyncReports}
                disabled={isSyncing}
                activeOpacity={0.8}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.syncBtnText}>
                    🔄 Sync{pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* FILTER TABS */}
          <View style={styles.filterTabsRow}>
            <TouchableOpacity
              style={[styles.filterTab, activeTab === 'ALL' && styles.filterTabActive]}
              onPress={() => setActiveTab('ALL')}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === 'ALL' && styles.filterTabTextActive,
                ]}
              >
                All Reports ({reports.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterTab,
                activeTab === 'PENDING' && styles.filterTabActive,
              ]}
              onPress={() => setActiveTab('PENDING')}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === 'PENDING' && styles.filterTabTextActive,
                ]}
              >
                Pending Sync ({pendingCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* REPORT LIST OR EMPTY STATE */}
          <View style={styles.listArea}>
            {isLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.loadingText}>Loading incident reports...</Text>
              </View>
            ) : displayedReports.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'PENDING' ? 'All Reports Synchronized' : 'No Incident Reports Yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {activeTab === 'PENDING'
                    ? 'All your emergency reports have been acknowledged by MDRRMO Central Dispatch.'
                    : 'Tap "Report An Emergency" above to immediately submit a report with offline backup.'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={displayedReports}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor="#059669"
                  />
                }
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const catConfig = CATEGORY_ICONS[item.category] || { icon: '📢', color: '#10b981' };
                  const formattedDate = new Date(item.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  });

                  const isSynced = item.localStatus === 'SYNCED';

                  return (
                    <TouchableOpacity
                      style={styles.reportCard}
                      onPress={() => setSelectedReport(item)}
                      activeOpacity={0.8}
                    >
                      {/* CARD TOP ROW */}
                      <View style={styles.cardTopRow}>
                        <View style={styles.categoryBadgeRow}>
                          <View
                            style={[
                              styles.categoryIconWrap,
                              { backgroundColor: `${catConfig.color}20`, borderColor: catConfig.color },
                            ]}
                          >
                            <Text style={styles.categoryEmoji}>{catConfig.icon}</Text>
                          </View>
                          <Text style={styles.categoryTitleText}>{item.category}</Text>
                          
                          {/* Severity pill */}
                          <View
                            style={[
                              styles.severityPill,
                              item.severity === 'CRITICAL' && styles.sevCritical,
                              item.severity === 'HIGH' && styles.sevHigh,
                              item.severity === 'MEDIUM' && styles.sevMedium,
                              item.severity === 'LOW' && styles.sevLow,
                            ]}
                          >
                            <Text style={styles.severityPillText}>{item.severity}</Text>
                          </View>
                        </View>

                        <Text style={styles.cardTimeText}>{formattedDate}</Text>
                      </View>

                      {/* DESCRIPTION */}
                      <Text style={styles.cardDescText} numberOfLines={2}>
                        {item.description}
                      </Text>

                      {/* CARD FOOTER */}
                      <View style={styles.cardFooterRow}>
                        <View style={styles.cardLocationBadge}>
                          <Text style={styles.cardLocationText}>
                            📍 {item.nearestBuilding || 'Central Poblacion'}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.syncStatusBadge,
                            isSynced ? styles.syncBadgeSynced : styles.syncBadgePending,
                          ]}
                        >
                          <Text
                            style={[
                              styles.syncStatusText,
                              isSynced ? styles.syncTextSynced : styles.syncTextPending,
                            ]}
                          >
                            {isSynced ? '✓ Synced with MDRRMO' : '⏳ Saved Locally'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      )}

      {/* BOTTOM NAVIGATION BAR */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'REPORTS' && styles.navItemActive]}
          onPress={() => setCurrentScreen('REPORTS')}
          activeOpacity={0.8}
        >
          <Text style={styles.navIcon}>📋</Text>
          <Text style={[styles.navText, currentScreen === 'REPORTS' && styles.navTextActive]}>
            Reports
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'MAP' && styles.navItemActive]}
          onPress={() => setCurrentScreen('MAP')}
          activeOpacity={0.8}
        >
          <Text style={styles.navIcon}>🗺️</Text>
          <Text style={[styles.navText, currentScreen === 'MAP' && styles.navTextActive]}>
            Evacuation Map
          </Text>
        </TouchableOpacity>
      </View>

      {/* POP-UP DIRECT MESSAGE MODAL (GUARANTEED VISIBILITY ON ALL DEVICES) */}
      <Modal
        visible={isReplyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsReplyModalVisible(false)}
      >
        <View style={styles.replyModalOverlay}>
          <View style={styles.replyModalCard}>
            <View style={styles.replyModalHeader}>
              <Text style={styles.replyModalBadge}>🚨 MDRRMO CENTRAL COMMAND</Text>
              <Text style={styles.replyModalTitle}>Direct Message to Your Device</Text>
            </View>

            <View style={styles.replyModalBody}>
              <Text style={styles.replyModalQuote}>"{adminReply?.message}"</Text>
              <Text style={styles.replyModalMeta}>
                Sent at {adminReply ? new Date(adminReply.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.replyModalButton}
              onPress={() => setIsReplyModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.replyModalBtnText}>✓ Acknowledge Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODALS */}
      <CreateReportModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateReport}
      />

      <ReportDetailModal
        visible={!!selectedReport}
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onDelete={handleDeleteReport}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    fontSize: 11.5,
    color: '#94a3b8',
    marginTop: 1,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  devicePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  devicePillText: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotLive: {
    backgroundColor: '#10b981',
  },
  statusDotOffline: {
    backgroundColor: '#f59e0b',
  },
  connectionText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
  },
  // ACTION HERO CONTAINER & CARD
  actionHeroContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  actionHeroCard: {
    backgroundColor: '#991b1b',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  heroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  heroIcon: {
    fontSize: 30,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  heroSub: {
    color: '#fecaca',
    fontSize: 11,
    marginTop: 2,
    maxWidth: '92%',
  },
  heroBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  heroBtnText: {
    color: '#991b1b',
    fontWeight: '900',
    fontSize: 12,
  },
  // SECTION HEADER & SYNC
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionSub: {
    color: '#64748b',
    fontSize: 10.5,
  },
  controlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  syncBtnPending: {
    backgroundColor: '#065f46',
    borderColor: '#059669',
  },
  syncBtnText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
  // FILTER TABS
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterTabActive: {
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
    borderColor: '#059669',
  },
  filterTabText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#34d399',
    fontWeight: '800',
  },
  // TARGETED MDRRMO REPLY CARD
  replyCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: '#0c4a6e',
    borderColor: '#0284c7',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  replyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  replyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  replyIcon: {
    fontSize: 18,
  },
  replySenderText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  replyTimeText: {
    color: '#bae6fd',
    fontSize: 10.5,
  },
  replyDismissBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  replyDismissText: {
    color: '#f0f9ff',
    fontSize: 11,
    fontWeight: '700',
  },
  replyBodyText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  listArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    gap: 8,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  // REPORT CARD
  reportCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 14,
  },
  categoryTitleText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  severityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  sevCritical: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  sevHigh: {
    backgroundColor: 'rgba(249, 115, 22, 0.25)',
  },
  sevMedium: {
    backgroundColor: 'rgba(234, 179, 8, 0.25)',
  },
  sevLow: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  severityPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#e2e8f0',
  },
  cardTimeText: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  cardDescText: {
    color: '#cbd5e1',
    fontSize: 12.5,
    lineHeight: 17,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLocationText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  syncStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  syncBadgeSynced: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  syncBadgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  syncStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  syncTextSynced: {
    color: '#34d399',
  },
  syncTextPending: {
    color: '#fbbf24',
  },
  // BOTTOM NAVIGATION
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 24,
    justifyContent: 'space-around',
  },
  navItem: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: '#1e293b',
  },
  navIcon: {
    fontSize: 18,
  },
  navText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  navTextActive: {
    color: '#10b981',
    fontWeight: '800',
  },
  // POP-UP DIRECT MESSAGE MODAL
  replyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  replyModalCard: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#0284c7',
    padding: 20,
    gap: 14,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  replyModalHeader: {
    gap: 4,
  },
  replyModalBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 1.5,
  },
  replyModalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
  },
  replyModalBody: {
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.25)',
    gap: 8,
  },
  replyModalQuote: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f0f9ff',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  replyModalMeta: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  replyModalButton: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  replyModalBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
