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
} from 'react-native';
import { GabayXReport, CreateReportInput } from './src/types/report';
import { reportRepository } from './src/database/reportRepository';
import { ReportStatusBadge } from './src/components/ReportStatusBadge';
import { CreateReportModal } from './src/components/CreateReportModal';
import { ReportDetailModal } from './src/components/ReportDetailModal';
import { MapScreen } from './src/screens/MapScreen';
import { syncService } from './src/sync/syncService';
import { alertService, AdminReplyMessage } from './src/services/alertService';
import { DisasterAlert } from './src/types/alert';
import { DisasterAlertBanner } from './src/components/DisasterAlertBanner';

export default function App() {
  const [reports, setReports] = useState<GabayXReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<'REPORTS' | 'MAP'>('REPORTS');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING'>('ALL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<GabayXReport | null>(null);

  // Real-time Disaster Alerts from Central Command
  const [activeAlert, setActiveAlert] = useState<DisasterAlert | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [autoRouteRequested, setAutoRouteRequested] = useState(false);

  // Targeted private direct replies from MDRRMO Dispatch to this user
  const [adminReply, setAdminReply] = useState<AdminReplyMessage | null>(null);

  /**
   * Connect to Central Dispatch via Socket.io for live disaster alerts and private two-way replies
   */
  useEffect(() => {
    alertService.connect();

    // 1. Listen for community-wide broadcasts
    const unsubAlert = alertService.subscribeAlert((alert) => {
      setActiveAlert(alert);
      Alert.alert(
        `🚨 ${String(alert.type).toUpperCase()} BROADCAST`,
        `${alert.message}\n\nPlease proceed immediately to the nearest designated Municipal Safe Hub.`,
        [
          {
            text: '🗺️ View Routes',
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

    // 2. Listen for private targeted direct reply from MDRRMO to this device
    const unsubReply = alertService.subscribeReply((reply) => {
      setAdminReply(reply);
      Alert.alert(
        `📩 Direct Message from ${reply.sender}`,
        `"${reply.message}"\n\nSent at ${new Date(reply.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
        [{ text: 'Acknowledge', style: 'default' }]
      );
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
        Alert.alert('Up to Date', 'All your incident reports are already synced with MDRRMO Dispatch.');
      } else {
        Alert.alert(
          'Saved on Device',
          'Could not reach server. Your reports remain safely stored on this phone and will sync once connected.',
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
   * Handle emergency report creation
   */
  const handleCreateReport = async (data: CreateReportInput) => {
    try {
      const created = await reportRepository.createReport(data);
      console.log(`[App] Emergency report ${created.id} saved to SQLite.`);
      await loadReports();
      Alert.alert(
        '🛡️ Report Saved on Phone',
        'Your incident report has been saved locally. It will upload to MDRRMO Dispatch once online or when you tap Sync.',
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

          {/* Sync Button */}
          <TouchableOpacity
            style={[
              styles.syncButton,
              pendingCount > 0 && styles.syncBtnPending,
            ]}
            onPress={handleSyncReports}
            disabled={isSyncing}
            activeOpacity={0.8}
            accessibilityLabel="Sync reports"
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
          {/* TOP PRIMARY ACTION CARDS */}
          <View style={styles.actionCardsRow}>
            {/* 1. REPORT EMERGENCY BUTTON */}
            <TouchableOpacity
              style={styles.actionCardRed}
              onPress={() => setIsCreateModalOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.actionCardIcon}>🚨</Text>
              <Text style={styles.actionCardTitle}>Report Emergency</Text>
              <Text style={styles.actionCardSub}>Send incident report to MDRRMO</Text>
            </TouchableOpacity>

            {/* 2. MUNICIPAL EVACUATION MAP BUTTON */}
            <TouchableOpacity
              style={styles.actionCardSlate}
              onPress={() => setCurrentScreen('MAP')}
              activeOpacity={0.85}
            >
              <Text style={styles.actionCardIcon}>🗺️</Text>
              <Text style={styles.actionCardTitle}>Evacuation Map</Text>
              <Text style={styles.actionCardSub}>View municipal safe hubs & routes</Text>
            </TouchableOpacity>
          </View>

          {/* SECTION HEADER & TABS */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Community Incident Reports</Text>
              <Text style={styles.sectionSub}>Stored safely on this device</Text>
            </View>

            <View style={styles.filterTabs}>
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
                  All ({reports.length})
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
                  Pending ({pendingCount})
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* REPORT LIST OR EMPTY STATE */}
          <View style={styles.listArea}>
            {isLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.loadingText}>Loading reports...</Text>
              </View>
            ) : displayedReports.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'PENDING' ? 'No Pending Reports' : 'No Reports Filed Yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {activeTab === 'PENDING'
                    ? 'All your emergency reports have been synced with MDRRMO Dispatch.'
                    : 'When you file an incident report, it will be stored securely on your phone even without internet.'}
                </Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => setIsCreateModalOpen(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyBtnText}>+ File Incident Report</Text>
                </TouchableOpacity>
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
                  const formattedDate = new Date(item.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  });

                  return (
                    <TouchableOpacity
                      style={styles.reportCard}
                      onPress={() => setSelectedReport(item)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.categoryWrap}>
                          <Text style={styles.categoryName}>{item.category}</Text>
                          <View style={[styles.sevPill, styles[`sev_${item.severity}`]]}>
                            <Text style={styles.sevPillText}>{item.severity}</Text>
                          </View>
                        </View>
                        <Text style={styles.cardTime}>{formattedDate}</Text>
                      </View>

                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {item.description}
                      </Text>

                      <View style={styles.cardFooter}>
                        <ReportStatusBadge status={item.localStatus} size="small" />
                        <Text style={styles.cardLocation}>
                          📍 {item.nearestBuilding || 'Central Poblacion'}
                        </Text>
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
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  syncButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
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
  // ACTION CARDS
  actionCardsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  actionCardRed: {
    flex: 1,
    backgroundColor: '#b91c1c',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  actionCardSlate: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  actionCardIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  actionCardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  actionCardSub: {
    color: '#cbd5e1',
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },
  // SECTION HEADER
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  sectionSub: {
    color: '#64748b',
    fontSize: 11,
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 2,
  },
  filterTab: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#334155',
  },
  filterTabText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#ffffff',
  },
  // LIST AREA
  listArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 16,
    gap: 8,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 280,
    marginBottom: 14,
  },
  emptyBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  emptyBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  reportCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
  },
  sevPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sevPillText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sev_CRITICAL: {
    backgroundColor: '#450a0a',
  },
  sev_HIGH: {
    backgroundColor: '#431407',
  },
  sev_MEDIUM: {
    backgroundColor: '#451a03',
  },
  sev_LOW: {
    backgroundColor: '#064e3b',
  },
  cardTime: {
    color: '#64748b',
    fontSize: 11,
  },
  cardDesc: {
    color: '#cbd5e1',
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
  },
  cardLocation: {
    color: '#94a3b8',
    fontSize: 11,
  },
  // BOTTOM NAVIGATION
  bottomNav: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
  },
  navItem: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: '#1e293b',
  },
  navIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  navText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  navTextActive: {
    color: '#34d399',
    fontWeight: '700',
  },
});
