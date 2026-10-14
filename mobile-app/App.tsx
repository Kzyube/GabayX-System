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
          '✅ Cloud Sync Complete',
          `Successfully dispatched ${res.syncedCount} offline report(s) to Central Dispatch. Server verified receipt.`,
          [{ text: 'OK' }]
        );
      } else if (res.totalPending === 0) {
        Alert.alert('Up to Date', 'All reports are already synchronized.');
      } else {
        Alert.alert(
          '📡 Offline Mode',
          'Server unreachable. Reports remain securely stored in local SQLite storage with status PENDING.',
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
        '🛡️ Report Saved Locally',
        'Your emergency report has been safely saved to device SQLite storage with status PENDING. It will be dispatched once a mesh peer or internet connectivity is detected.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      console.error('[App] Failed to save report:', err);
      throw err; // Re-throw so modal can display error message to user
    }
  };

  /**
   * Handle deleting an unsent draft
   */
  const handleDeleteReport = async (id: string) => {
    Alert.alert(
      'Delete Local Report',
      'Are you sure you want to delete this unsent report from local storage?',
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
          <View style={styles.brandRow}>
            <Text style={styles.brandTitle}>GABAYX</Text>
            <View style={styles.platformBadge}>
              <Text style={styles.platformBadgeText}>MOBILE</Text>
            </View>
          </View>
          <Text style={styles.brandSubtitle}>
            {currentScreen === 'REPORTS'
              ? 'Disaster-Response • Offline SQLite'
              : 'Campus Navigation • Native Map'}
          </Text>
        </View>

        <View style={styles.statusIndicator}>
          <View style={styles.statusDot} />
          <Text style={styles.statusIndicatorText}>
            {currentScreen === 'REPORTS' ? 'SQLite Active' : 'Map Scaffold'}
          </Text>
        </View>
      </View>

      {/* SCREEN CONTENT: REPORTS OR MAP */}
      {currentScreen === 'MAP' ? (
        <MapScreen />
      ) : (
        <>
          {/* CALL TO ACTION: FILE EMERGENCY REPORT */}
          <View style={styles.ctaContainer}>
            <TouchableOpacity
              style={styles.sosCtaButton}
              onPress={() => setIsCreateModalOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.sosCtaIcon}>🚨</Text>
              <View>
                <Text style={styles.sosCtaTitle}>FILE EMERGENCY REPORT</Text>
                <Text style={styles.sosCtaSubtitle}>
                  Saves instantly to offline device storage (No internet required)
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* OFFLINE NOTICE BANNER */}
          <View style={styles.disclaimerBanner}>
            <Text style={styles.disclaimerIcon}>ℹ️</Text>
            <Text style={styles.disclaimerText}>
              Offline-first mode active. Reports are persisted locally with status{' '}
              <Text style={{ fontWeight: '800', color: '#fbbf24' }}>PENDING</Text> and have not yet
              reached central dispatch until synced.
            </Text>
          </View>

          {/* ERROR BANNER */}
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {/* TABS & METRICS STRIP */}
          <View style={styles.tabsStrip}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'ALL' && styles.tabButtonActive]}
              onPress={() => setActiveTab('ALL')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'ALL' && styles.tabButtonTextActive]}>
                ALL ({reports.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'PENDING' && styles.tabButtonActive]}
              onPress={() => setActiveTab('PENDING')}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === 'PENDING' && styles.tabButtonTextActive,
                ]}
              >
                PENDING ({pendingCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.syncButton}
              onPress={handleSyncReports}
              disabled={isSyncing}
              activeOpacity={0.8}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#10b981" />
              ) : (
                <Text style={styles.syncButtonText}>🔄 Sync</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* REPORT LIST OR EMPTY/LOADING STATES */}
          <View style={styles.listContainer}>
            {isLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={styles.loadingText}>Initializing SQLite storage...</Text>
              </View>
            ) : displayedReports.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'PENDING' ? 'No Pending Reports' : 'No Emergency Reports Yet'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeTab === 'PENDING'
                    ? 'All emergency reports have been processed.'
                    : 'Reports you create offline will appear here and persist across restarts.'}
                </Text>
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => setIsCreateModalOpen(true)}
                >
                  <Text style={styles.emptyActionText}>+ Create First Report</Text>
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
                    tintColor="#10b981"
                  />
                }
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const formattedDate = new Date(item.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <TouchableOpacity
                      style={styles.reportCard}
                      onPress={() => setSelectedReport(item)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardCategoryRow}>
                          <Text style={styles.cardCategoryText}>{item.category}</Text>
                          <View style={[styles.sevPill, styles[`sev_${item.severity}`]]}>
                            <Text style={styles.sevPillText}>{item.severity}</Text>
                          </View>
                        </View>
                        <Text style={styles.cardTimeText}>{formattedDate}</Text>
                      </View>

                      <Text style={styles.cardDescription} numberOfLines={2}>
                        {item.description}
                      </Text>

                      <View style={styles.cardFooter}>
                        <ReportStatusBadge status={item.localStatus} size="small" />
                        <Text style={styles.cardLocationText}>
                          📍 {item.nearestBuilding || 'Campus Zone'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </>
      )}

      {/* BOTTOM NAVIGATION BAR */}
      <View style={styles.bottomNavBar}>
        <TouchableOpacity
          style={[styles.navTab, currentScreen === 'REPORTS' && styles.navTabActive]}
          onPress={() => setCurrentScreen('REPORTS')}
          activeOpacity={0.8}
        >
          <Text style={styles.navIcon}>📋</Text>
          <Text style={[styles.navLabel, currentScreen === 'REPORTS' && styles.navLabelActive]}>
            Reports
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navTab, currentScreen === 'MAP' && styles.navTabActive]}
          onPress={() => setCurrentScreen('MAP')}
          activeOpacity={0.8}
        >
          <Text style={styles.navIcon}>🗺️</Text>
          <Text style={[styles.navLabel, currentScreen === 'MAP' && styles.navLabelActive]}>
            Campus Map
          </Text>
        </TouchableOpacity>
      </View>

      {/* CREATE REPORT MODAL */}
      <CreateReportModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateReport}
      />

      {/* REPORT DETAIL MODAL */}
      <ReportDetailModal
        report={selectedReport}
        visible={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        onDelete={handleDeleteReport}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#060d09',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0c1712',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 1.5,
  },
  platformBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  platformBadgeText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 10.5,
    color: '#94a3b8',
    marginTop: 2,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  statusIndicatorText: {
    color: '#f1f5f9',
    fontSize: 10,
    fontWeight: '700',
  },
  ctaContainer: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  sosCtaButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  sosCtaIcon: {
    fontSize: 24,
  },
  sosCtaTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sosCtaSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10.5,
    marginTop: 2,
  },
  disclaimerBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 8,
    marginHorizontal: 18,
    marginTop: 10,
    padding: 10,
    alignItems: 'center',
    gap: 8,
  },
  disclaimerIcon: {
    fontSize: 14,
  },
  disclaimerText: {
    flex: 1,
    color: '#fef3c7',
    fontSize: 10.5,
    lineHeight: 15,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    marginHorizontal: 18,
    marginTop: 8,
    padding: 10,
  },
  errorBannerText: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '600',
  },
  tabsStrip: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#10b981',
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  tabButtonTextActive: {
    color: '#10b981',
  },
  syncButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  syncButtonText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '800',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 18,
  },
  listContent: {
    paddingVertical: 12,
    gap: 10,
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
    marginTop: 12,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyActionBtn: {
    marginTop: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  emptyActionText: {
    color: '#10b981',
    fontWeight: '800',
    fontSize: 12,
  },
  reportCard: {
    backgroundColor: '#0c1712',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardCategoryText: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '800',
  },
  cardTimeText: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  cardDescription: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  cardLocationText: {
    color: '#94a3b8',
    fontSize: 10,
  },
  sevPill: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  sevPillText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#f1f5f9',
  },
  sev_CRITICAL: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  sev_HIGH: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
    borderColor: '#f97316',
  },
  sev_MEDIUM: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    borderColor: '#eab308',
  },
  sev_LOW: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3b82f6',
  },
  bottomNavBar: {
    flexDirection: 'row',
    backgroundColor: '#0c1712',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  navTabActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  navIcon: {
    fontSize: 20,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  navLabelActive: {
    color: '#10b981',
  },
});
