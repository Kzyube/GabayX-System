import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GabayXReport, CreateReportInput } from './src/types/report';
import { reportRepository } from './src/database/reportRepository';
import { CreateReportModal } from './src/components/CreateReportModal';
import { ReportDetailModal } from './src/components/ReportDetailModal';
import { MapScreen } from './src/screens/MapScreen';
import { syncService } from './src/sync/syncService';
import { alertService, AdminReplyMessage, ResidentStatus } from './src/services/alertService';
import { DisasterAlert } from './src/types/alert';
import { DisasterAlertBanner } from './src/components/DisasterAlertBanner';
import { getResidentDeviceId, getStoredResidentStatus, setStoredResidentStatus } from './src/utils/deviceIdentity';
import { GCashVoucher } from './src/types/voucher';
import { voucherRepository } from './src/database/voucherRepository';
import { DonateModal } from './src/components/DonateModal';
import { VoucherAlertModal } from './src/components/VoucherAlertModal';
import { VouchersListModal } from './src/components/VouchersListModal';
import { HotlinesModal } from './src/components/HotlinesModal';
import { soundService } from './src/services/soundService';
import { AudioPlayer } from './src/components/AudioPlayer';

const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
  MEDICAL: { icon: '🚑', color: '#dc2626' },
  FIRE: { icon: '🔥', color: '#ea580c' },
  FLOOD: { icon: '🌊', color: '#0284c7' },
  EARTHQUAKE: { icon: '🏚️', color: '#d97706' },
  TRAPPED: { icon: '🆘', color: '#b91c1c' },
  HAZARD: { icon: '⚠️', color: '#ca8a04' },
  GENERAL: { icon: '📢', color: '#16a34a' },
};

type ScreenTab = 'REPORTS' | 'MAP' | 'AID';

export default function App() {
  const [reports, setReports] = useState<GabayXReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<ScreenTab>('REPORTS');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING'>('ALL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Device identity
  const [residentDeviceId, setResidentDeviceId] = useState<string>('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<GabayXReport | null>(null);
  const [isReplyModalVisible, setIsReplyModalVisible] = useState(false);
  const [isHotlinesOpen, setIsHotlinesOpen] = useState(false);

  // Real-time Disaster Alerts from Central Command
  const [activeAlert, setActiveAlert] = useState<DisasterAlert | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [autoRouteRequested, setAutoRouteRequested] = useState(false);

  // Targeted private direct replies from MDRRMO Dispatch to this user
  const [adminReply, setAdminReply] = useState<AdminReplyMessage | null>(null);

  // Resident safety status
  const [residentStatus, setResidentStatus] = useState<ResidentStatus>('SAFE');

  // GCash Voucher & Donation System
  const [vouchers, setVouchers] = useState<GCashVoucher[]>([]);
  const [isDonateModalOpen, setIsDonateModalOpen] = useState(false);
  const [isVouchersListOpen, setIsVouchersListOpen] = useState(false);
  const [incomingVoucherAlert, setIncomingVoucherAlert] = useState<GCashVoucher | null>(null);
  const [isVoucherAlertOpen, setIsVoucherAlertOpen] = useState(false);

  /**
   * Initialize device identity and Socket.io connection
   */
  useEffect(() => {
    getResidentDeviceId().then((id) => {
      setResidentDeviceId(id);
    });

    alertService.connect();

    // 1. Listen for community disaster broadcasts (triggers siren & vibration)
    const unsubAlert = alertService.subscribeAlert((alert) => {
      setActiveAlert(alert);
      Alert.alert(
        `🚨 ${String(alert.type).toUpperCase()} BROADCAST`,
        `${alert.message}\n\nPlease proceed immediately along the designated municipal road route to the nearest Safe Hub.`,
        [
          {
            text: '🗺️ View Evacuation Route',
            onPress: () => {
              soundService.stopEmergencySiren();
              setAutoRouteRequested(true);
              setCurrentScreen('MAP');
            },
          },
          {
            text: 'Silence Siren',
            style: 'cancel',
            onPress: () => soundService.stopEmergencySiren(),
          },
        ]
      );
    });

    const unsubClear = alertService.subscribeClear(() => {
      setActiveAlert(null);
      soundService.stopEmergencySiren();
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

    // 3. Listen for resident safety status updates
    getStoredResidentStatus().then((stored) => {
      setResidentStatus(stored);
    });
    const unsubResidentStatus = alertService.subscribeResidentStatus((status) => {
      setResidentStatus(status);
    });

    // 4. Listen for real-time community GCash vouchers received
    const unsubVoucher = alertService.subscribeVoucher((voucher) => {
      console.log('[App] New GCash relief voucher received:', voucher);
      setIncomingVoucherAlert(voucher);
      setIsVoucherAlertOpen(true);
      voucherRepository.getAllVouchers().then(setVouchers).catch(() => {});
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
      unsubResidentStatus();
      unsubVoucher();
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
   * Load vouchers from local SQLite database
   */
  const loadVouchers = useCallback(async () => {
    try {
      const data = await voucherRepository.getAllVouchers();
      setVouchers(data);
    } catch (err) {
      console.warn('[App] Failed to load vouchers:', err);
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
        await loadVouchers();
      } catch (err) {
        console.error('[App] Database initialization failed:', err);
        setErrorMessage('Database initialization failed. Please restart the app.');
        setIsLoading(false);
      }
    }
    init();
  }, [loadReports, loadVouchers]);

  /**
   * Pull-to-refresh handler
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadReports(), loadVouchers()]);
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
   * Handle emergency report creation
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

      // Background sync attempt with REST backend
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

  /**
   * Toggle resident safety status from header bar
   */
  const handleToggleStatusFromHeader = () => {
    if (residentStatus === 'SAFE') {
      Alert.alert(
        'Declare Emergency SOS?',
        'This will mark your status as IN DANGER, send distress telemetry to MDRRMO, and open the road evacuation route.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Declare SOS',
            style: 'destructive',
            onPress: async () => {
              setResidentStatus('DANGER');
              await setStoredResidentStatus('DANGER');
              await alertService.updateResidentStatus('DANGER', null, 10);
              setAutoRouteRequested(true);
              setCurrentScreen('MAP');
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Mark as Safe?',
        'This will inform MDRRMO Central Dispatch that you have reached a secure assembly area.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: "Yes, I'm Safe",
            onPress: async () => {
              setResidentStatus('SAFE');
              await setStoredResidentStatus('SAFE');
              await alertService.updateResidentStatus('SAFE', null, 10);
              Alert.alert('✅ Marked Safe', 'MDRRMO Central Dispatch received your confirmation.');
            },
          },
        ]
      );
    }
  };

  const handleCopyVoucher = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert('Copied to Clipboard', `Voucher Code: ${code}`);
    } catch {}
  };

  const handleClaimVoucher = async (id: string, code: string) => {
    Alert.alert(
      'Redeem Voucher?',
      `Mark voucher ${code} as redeemed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Redeemed',
          onPress: async () => {
            await voucherRepository.markClaimed(id);
            await loadVouchers();
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

  const unclaimedCount = vouchers.filter((v) => !v.isClaimed).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* CLEAN CIVIC HEADER BAR */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>GabayX</Text>
          <Text style={styles.brandSubtitle}>MDRRMO Public Safety Platform</Text>
        </View>

        <View style={styles.headerRightGroup}>
          {/* Safety Status Toggle Pill */}
          <TouchableOpacity
            style={[
              styles.statusHeaderBadge,
              residentStatus === 'SAFE' ? styles.statusBadgeSafe : styles.statusBadgeDanger,
            ]}
            onPress={handleToggleStatusFromHeader}
            activeOpacity={0.8}
            accessibilityLabel="Toggle Safety Status"
          >
            <View
              style={[
                styles.statusHeaderDot,
                residentStatus === 'SAFE' ? styles.statusDotSafe : styles.statusDotDanger,
              ]}
            />
            <Text
              style={[
                styles.statusHeaderBadgeText,
                residentStatus === 'SAFE' ? styles.statusTextSafe : styles.statusTextDanger,
              ]}
            >
              {residentStatus === 'SAFE' ? 'Safe' : 'SOS'}
            </Text>
          </TouchableOpacity>

          {/* Quick Hotlines Button */}
          <TouchableOpacity
            style={styles.hotlinesHeaderBtn}
            onPress={() => setIsHotlinesOpen(true)}
            activeOpacity={0.8}
            accessibilityLabel="Emergency Hotlines"
          >
            <Text style={styles.hotlinesHeaderBtnText}>Hotlines</Text>
          </TouchableOpacity>

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

      {/* REAL-TIME DISASTER ALERT BANNER WITH AUDIBLE SIREN & SILENCE CONTROL */}
      <DisasterAlertBanner
        alert={activeAlert}
        onPressViewMap={() => {
          soundService.stopEmergencySiren();
          setAutoRouteRequested(true);
          setCurrentScreen('MAP');
        }}
      />

      {/* TARGETED PRIVATE DIRECT MESSAGE FROM MDRRMO DISPATCH */}
      {adminReply && (
        <View style={styles.replyCard}>
          <View style={styles.replyCardHeader}>
            <View style={styles.replyTitleRow}>
              <View>
                <Text style={styles.replySenderText}>{adminReply.sender}</Text>
                <Text style={styles.replyTimeText}>
                  Direct Dispatch Message • {new Date(adminReply.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.replyDismissBtn}
              onPress={() => setAdminReply(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Dismiss message"
            >
              <Text style={styles.replyDismissText}>Dismiss ✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.replyBodyText}>"{adminReply.message}"</Text>
        </View>
      )}

      {/* SCREEN 1: INCIDENT REPORTS & EMERGENCY DISPATCH */}
      {currentScreen === 'REPORTS' && (
        <View style={styles.contentContainer}>
          {/* PRIMARY EMERGENCY ACTION (TOP-PRIORITY BUTTON - 54px min height) */}
          <View style={styles.sosContainer}>
            <TouchableOpacity
              style={styles.sosCard}
              onPress={() => setIsCreateModalOpen(true)}
              activeOpacity={0.85}
              accessibilityLabel="Report Emergency Incident"
            >
              <View style={styles.sosLeft}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sosTitle}>Report Emergency Incident</Text>
                  <Text style={styles.sosSub}>
                    Direct incident dispatch to MDRRMO Central Command
                  </Text>
                </View>
              </View>
              <View style={styles.sosButtonPill}>
                <Text style={styles.sosButtonPillText}>Report</Text>
              </View>
            </TouchableOpacity>

            {/* QUICK ACTIONS ROW: EVACUATION MAP, HOTLINES, AID */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => setCurrentScreen('MAP')}
                activeOpacity={0.8}
                accessibilityLabel="Open evacuation map"
              >
                <Text style={styles.quickActionText}>Evacuation Map</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => setIsHotlinesOpen(true)}
                activeOpacity={0.8}
                accessibilityLabel="Open hotlines directory"
              >
                <Text style={styles.quickActionText}>Hotlines</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => setCurrentScreen('AID')}
                activeOpacity={0.8}
                accessibilityLabel="Open relief aid wallet"
              >
                <Text style={styles.quickActionText}>
                  Relief Aid{unclaimedCount > 0 ? ` (${unclaimedCount})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SECTION HEADER & SYNC CONTROLS */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Incident Reports</Text>
              <Text style={styles.sectionSub}>Stored safely in device offline storage</Text>
            </View>

            <View style={styles.controlsRight}>
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
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.syncBtnText}>
                    Sync{pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* FILTER TABS */}
          <View style={styles.filterTabsRow}>
            <View style={styles.filterTabsWrapper}>
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
                style={[styles.filterTab, activeTab === 'PENDING' && styles.filterTabActive]}
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
          </View>

          {/* ERROR NOTICE */}
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* REPORTS LIST OR EMPTY STATE */}
          <View style={styles.listContainer}>
            {isLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#0F766E" />
                <Text style={styles.centerBoxText}>Loading local reports...</Text>
              </View>
            ) : displayedReports.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'PENDING' ? 'No Pending Uploads' : 'No Incident Reports Logged'}
                </Text>
                <Text style={styles.emptySub}>
                  {activeTab === 'PENDING'
                    ? 'All reports on this device are verified and synchronized with MDRRMO Central Command.'
                    : 'Tap "Report Emergency Incident" above to log and dispatch a situation report.'}
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
                    tintColor="#0F766E"
                  />
                }
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const catConfig = CATEGORY_ICONS[item.category] || { icon: '', color: '#0F766E' };
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
                      <View style={styles.cardTopRow}>
                        <View style={styles.categoryBadgeRow}>
                          <View
                            style={[
                              styles.categoryDot,
                              { backgroundColor: catConfig.color },
                            ]}
                          />
                          <Text style={styles.categoryTitleText}>{item.category}</Text>
                          
                          <View
                            style={[
                              styles.severityPill,
                              item.severity === 'CRITICAL' && styles.sevCritical,
                              item.severity === 'HIGH' && styles.sevHigh,
                              item.severity === 'MEDIUM' && styles.sevMedium,
                              item.severity === 'LOW' && styles.sevLow,
                            ]}
                          >
                            <Text
                              style={[
                                styles.severityPillText,
                                item.severity === 'CRITICAL' && styles.sevCriticalText,
                                item.severity === 'HIGH' && styles.sevHighText,
                                item.severity === 'MEDIUM' && styles.sevMediumText,
                                item.severity === 'LOW' && styles.sevLowText,
                              ]}
                            >
                              {item.severity}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.cardTimeText}>{formattedDate}</Text>
                      </View>

                      <Text style={styles.cardDescText} numberOfLines={2}>
                        {item.description}
                      </Text>

                      <View style={styles.cardFooterRow}>
                        <View style={styles.cardLocationBadge}>
                          <Text style={styles.cardLocationText}>
                            {item.nearestBuilding || 'Central Poblacion'}
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
                            {isSynced ? '✓ Synced to MDRRMO' : 'Saved Locally'}
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

      {/* SCREEN 2: EVACUATION MAP */}
      {currentScreen === 'MAP' && (
        <MapScreen
          initialAutoRoute={autoRouteRequested}
          onClearAutoRoute={() => setAutoRouteRequested(false)}
          activeDisaster={activeAlert}
        />
      )}

      {/* SCREEN 3: RELIEF AID & GCASH VOUCHERS */}
      {currentScreen === 'AID' && (
        <ScrollView style={styles.aidContainer} contentContainerStyle={styles.aidContentContainer} showsVerticalScrollIndicator={false}>
          {/* COMMUNITY RELIEF AID CARD */}
          <View style={styles.aidHeroCard}>
            <View style={styles.aidHeroBadge}>
              <Text style={styles.aidHeroBadgeText}>MDRRMO DISASTER RELIEF SYSTEM</Text>
            </View>
            <Text style={styles.aidHeroTitle}>Community Relief Aid</Text>
            <Text style={styles.aidHeroSub}>
              Deploy GCash emergency funds directly to disaster-affected residents. Generates verified claim vouchers redeemable at MDRRMO relief distribution centers.
            </Text>
            <TouchableOpacity
              style={styles.deployAidBtn}
              onPress={() => setIsDonateModalOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.deployAidBtnText}>+ Deploy GCash Relief Funds</Text>
            </TouchableOpacity>
          </View>

          {/* VOUCHER WALLET HEADER */}
          <View style={styles.walletHeaderRow}>
            <View>
              <Text style={styles.walletSectionTitle}>My Relief Vouchers</Text>
              <Text style={styles.walletSectionSub}>Claimable emergency relief vouchers</Text>
            </View>
            <View style={styles.walletBadge}>
              <Text style={styles.walletBadgeText}>
                {unclaimedCount} Ready to Claim
              </Text>
            </View>
          </View>

          {/* VOUCHER LIST OR EMPTY STATE */}
          {vouchers.length === 0 ? (
            <View style={styles.emptyVouchersBox}>
              <Text style={styles.emptyVouchersTitle}>No Vouchers Received Yet</Text>
              <Text style={styles.emptyVouchersSub}>
                When community donors or MDRRMO deploy relief assistance, your claim codes will appear here automatically.
              </Text>
              <TouchableOpacity
                style={styles.emptyDonateBtn}
                onPress={() => setIsDonateModalOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyDonateBtnText}>Deploy Relief Aid as Donor</Text>
              </TouchableOpacity>
            </View>
          ) : (
            vouchers.map((v) => (
              <View key={v.id} style={[styles.voucherItemCard, v.isClaimed && styles.voucherClaimedCard]}>
                <View style={styles.voucherItemTop}>
                  <View>
                    <Text style={styles.voucherCodeLabel}>CLAIM VOUCHER CODE</Text>
                    <Text style={styles.voucherCodeText}>{v.voucherCode}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.copyPillBtn}
                    onPress={() => handleCopyVoucher(v.voucherCode)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.copyPillBtnText}>Copy Code</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.voucherItemDivider} />

                <View style={styles.voucherItemMeta}>
                  <View>
                    <Text style={styles.voucherMetaLabel}>VALUE</Text>
                    <Text style={styles.voucherMetaValue}>₱{v.amount.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text style={styles.voucherMetaLabel}>BENEFICIARY</Text>
                    <Text style={styles.voucherMetaValue}>Good for {v.personsCount} Person(s)</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.voucherMetaLabel}>STATUS</Text>
                    <Text style={[styles.voucherStatusPill, v.isClaimed ? styles.statusClaimed : styles.statusUnclaimed]}>
                      {v.isClaimed ? 'Redeemed' : 'Ready to Claim'}
                    </Text>
                  </View>
                </View>

                <View style={styles.voucherDonorRow}>
                  <Text style={styles.voucherDonorText}>
                    Donor: {v.donorName} • Zone: {v.targetZone}
                  </Text>
                  {!v.isClaimed && (
                    <TouchableOpacity
                      onPress={() => handleClaimVoucher(v.id, v.voucherCode)}
                      style={styles.markClaimedLink}
                    >
                      <Text style={styles.markClaimedLinkText}>Mark Redeemed</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* THREE-TAB INDUSTRY-STANDARD BOTTOM NAVIGATION BAR */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'REPORTS' && styles.navItemActive]}
          onPress={() => setCurrentScreen('REPORTS')}
          activeOpacity={0.8}
        >
          <Text style={[styles.navText, currentScreen === 'REPORTS' && styles.navTextActive]}>
            Incidents
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'MAP' && styles.navItemActive]}
          onPress={() => setCurrentScreen('MAP')}
          activeOpacity={0.8}
        >
          <Text style={[styles.navText, currentScreen === 'MAP' && styles.navTextActive]}>
            Evacuation Map
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'AID' && styles.navItemActive]}
          onPress={() => setCurrentScreen('AID')}
          activeOpacity={0.8}
        >
          <View style={styles.navIconContainer}>
            <Text style={[styles.navText, currentScreen === 'AID' && styles.navTextActive]}>
              Relief Aid
            </Text>
            {unclaimedCount > 0 && (
              <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>{unclaimedCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* POP-UP DIRECT MESSAGE MODAL (GUARANTEED VISIBILITY ON ALL SCREENS) */}
      <Modal
        visible={isReplyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsReplyModalVisible(false)}
      >
        <View style={styles.replyModalOverlay}>
          <View style={styles.replyModalCard}>
            <View style={styles.replyModalHeader}>
              <Text style={styles.replyModalBadge}>MDRRMO CENTRAL DISPATCH</Text>
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
              <Text style={styles.replyModalBtnText}>Acknowledge Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CREATE EMERGENCY REPORT MODAL */}
      <CreateReportModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateReport}
      />

      {/* REPORT DETAIL MODAL */}
      <ReportDetailModal
        visible={!!selectedReport}
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onDelete={handleDeleteReport}
      />

      {/* GCASH RELIEF DONATION MODAL */}
      <DonateModal
        visible={isDonateModalOpen}
        onClose={() => setIsDonateModalOpen(false)}
        onDonationSuccess={() => {
          loadVouchers();
        }}
      />

      {/* GCASH VOUCHER RECEIVED CELEBRATION MODAL */}
      <VoucherAlertModal
        visible={isVoucherAlertOpen}
        voucher={incomingVoucherAlert}
        onClose={() => setIsVoucherAlertOpen(false)}
        onViewAllVouchers={() => {
          setIsVoucherAlertOpen(false);
          setCurrentScreen('AID');
        }}
      />

      {/* GCASH VOUCHERS LIST MODAL */}
      <VouchersListModal
        visible={isVouchersListOpen}
        vouchers={vouchers}
        onClose={() => setIsVouchersListOpen(false)}
        onRefreshVouchers={loadVouchers}
        onOpenDonateModal={() => {
          setIsVouchersListOpen(false);
          setIsDonateModalOpen(true);
        }}
      />

      {/* 1-TAP EMERGENCY HOTLINES DIRECTORY */}
      <HotlinesModal
        visible={isHotlinesOpen}
        onClose={() => setIsHotlinesOpen(false)}
      />

      {/* AUDIO ENGINE (WEBVIEW BRIDGE - NO NATIVE MODULES REQUIRED) */}
      <AudioPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
    fontWeight: '500',
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeSafe: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  statusBadgeDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotSafe: {
    backgroundColor: '#16A34A',
  },
  statusDotDanger: {
    backgroundColor: '#DC2626',
  },
  statusHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusTextSafe: {
    color: '#15803D',
  },
  statusTextDanger: {
    color: '#B91C1C',
  },
  hotlinesHeaderBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  hotlinesHeaderBtnText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '700',
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotLive: {
    backgroundColor: '#16A34A',
  },
  statusDotOffline: {
    backgroundColor: '#D97706',
  },
  connectionText: {
    color: '#475569',
    fontSize: 10.5,
    fontWeight: '600',
  },

  /* INCIDENT / REPORTS SCREEN */
  contentContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  sosContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sosCard: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#B91C1C',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  sosLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  sosTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  sosSub: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  sosButtonPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sosButtonPillText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  quickActionText: {
    color: '#0F172A',
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },

  /* SECTION HEADER & SYNC */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionSub: {
    color: '#64748B',
    fontSize: 11,
  },
  controlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncButton: {
    backgroundColor: '#0F766E',
    borderWidth: 1,
    borderColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  syncBtnPending: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  syncBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },

  /* FILTER TABS */
  filterTabsRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterTabsWrapper: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabText: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },

  /* LIST & CARDS */
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryTitleText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  severityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  sevCritical: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  sevHigh: { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' },
  sevMedium: { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' },
  sevLow: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
  severityPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  sevCriticalText: { color: '#DC2626' },
  sevHighText: { color: '#EA580C' },
  sevMediumText: { color: '#D97706' },
  sevLowText: { color: '#16A34A' },
  cardTimeText: {
    color: '#64748B',
    fontSize: 11,
  },
  cardDescText: {
    color: '#334155',
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 8,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  cardLocationBadge: {
    flex: 1,
  },
  cardLocationText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
  syncStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  syncBadgeSynced: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  syncBadgePending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  syncStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  syncTextSynced: {
    color: '#15803D',
  },
  syncTextPending: {
    color: '#B45309',
  },

  /* EMPTY / LOADING */
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  centerBoxText: {
    color: '#475569',
    fontSize: 12,
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 20,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 280,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '600',
  },

  /* AID SCREEN */
  aidContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  aidContentContainer: {
    padding: 16,
    paddingBottom: 90,
  },
  aidHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  aidHeroBadge: {
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  aidHeroBadgeText: {
    color: '#0F766E',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aidHeroTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  aidHeroSub: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 14,
  },
  deployAidBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  deployAidBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  walletHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  walletSectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  walletSectionSub: {
    color: '#64748B',
    fontSize: 11,
  },
  walletBadge: {
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  walletBadgeText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyVouchersBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    alignItems: 'center',
  },
  emptyVouchersTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyVouchersSub: {
    color: '#64748B',
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 14,
  },
  emptyDonateBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyDonateBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  voucherItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
  },
  voucherClaimedCard: {
    opacity: 0.65,
    backgroundColor: '#F1F5F9',
  },
  voucherItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voucherCodeLabel: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  voucherCodeText: {
    color: '#0F766E',
    fontSize: 17,
    fontWeight: '900',
    fontFamily: 'monospace',
    marginTop: 1,
    letterSpacing: 1,
  },
  copyPillBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  copyPillBtnText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  voucherItemDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  voucherItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  voucherMetaLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
  },
  voucherMetaValue: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 1,
  },
  voucherStatusPill: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 2,
  },
  statusClaimed: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
  },
  statusUnclaimed: {
    backgroundColor: '#F0FDF4',
    color: '#15803D',
  },
  voucherDonorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  voucherDonorText: {
    color: '#64748B',
    fontSize: 10.5,
    flex: 1,
  },
  markClaimedLink: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  markClaimedLinkText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },

  /* REPLY BANNER */
  replyCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0F766E',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
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
  },
  replySenderText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  replyTimeText: {
    color: '#64748B',
    fontSize: 10,
  },
  replyDismissBtn: {
    padding: 4,
  },
  replyDismissText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  replyBodyText: {
    color: '#0F172A',
    fontSize: 12.5,
    lineHeight: 17,
  },

  /* BOTTOM NAVIGATION BAR */
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 58,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  navItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#0F766E',
  },
  navIconContainer: {
    position: 'relative',
  },
  navBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  navBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  navText: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600',
  },
  navTextActive: {
    color: '#0F766E',
    fontWeight: '800',
  },

  /* MODALS */
  replyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  replyModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
  },
  replyModalHeader: {
    marginBottom: 12,
  },
  replyModalBadge: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#0F766E',
    letterSpacing: 0.8,
  },
  replyModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  replyModalBody: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 14,
  },
  replyModalQuote: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 20,
  },
  replyModalMeta: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 6,
  },
  replyModalButton: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  replyModalBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
