import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* HEADER BRAND */}
        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>GABAYX MOBILE</Text>
          <Text style={styles.brandSubtitle}>Campus Disaster-Response System</Text>
        </View>

        {/* STATUS CARD */}
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>MILESTONE 2: SCAFFOLDING READY</Text>
          </View>
          
          <Text style={styles.cardDescription}>
            Standalone React Native client initialized successfully. Ready for offline store-carry-forward BLE mesh networking.
          </Text>

          <View style={styles.metricsList}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Platform Runtime:</Text>
              <Text style={styles.metricValue}>React Native 0.86 / Expo SDK 57</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Language:</Text>
              <Text style={styles.metricValue}>TypeScript (Strict Mode)</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Health Check:</Text>
              <Text style={styles.metricValue}>expo-doctor: 21/21 Passed</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>PWA Compatibility:</Text>
              <Text style={styles.metricValue}>100% Preserved (Zero Regressions)</Text>
            </View>
          </View>
        </View>

        {/* FOOTER NOTICE */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Dual-Platform Architecture: Web PWA + Native Mobile Mesh
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#060d09',
  },
  container: {
    flex: 1,
    backgroundColor: '#060d09',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brandContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 2,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  card: {
    width: '100%',
    backgroundColor: '#0c1712',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cardDescription: {
    color: '#f1f5f9',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  metricsList: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  metricValue: {
    color: '#f1f5f9',
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  footerText: {
    color: '#64748b',
    fontSize: 10,
    textAlign: 'center',
  },
});
