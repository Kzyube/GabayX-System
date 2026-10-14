/**
 * GabayX Mobile - Disaster Alert Banner
 * High-visibility emergency announcement banner displayed prominently across screens.
 */

import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { DisasterAlert } from '../types/alert';

interface Props {
  alert: DisasterAlert | null;
  onPressViewMap: () => void;
  onDismiss?: () => void;
}

export const DisasterAlertBanner: React.FC<Props> = ({
  alert,
  onPressViewMap,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!alert) return null;

  const type = String(alert.type || 'EMERGENCY').toUpperCase();
  const isSupply = type === 'SUPPLY';

  // Get matching icon and color scheme
  let icon = '⚠️';
  let bannerBg = '#7f1d1d'; // Dark red
  let borderColor = '#ef4444'; // Bright red
  let titleColor = '#fecaca';

  if (type.includes('FIRE')) {
    icon = '🔥';
    bannerBg = '#7c2d12';
    borderColor = '#f97316';
    titleColor = '#fed7aa';
  } else if (type.includes('EARTHQUAKE')) {
    icon = '🌋';
    bannerBg = '#78350f';
    borderColor = '#eab308';
    titleColor = '#fef08a';
  } else if (type.includes('FLOOD') || type.includes('TSUNAMI')) {
    icon = '🌊';
    bannerBg = '#1e3a8a';
    borderColor = '#3b82f6';
    titleColor = '#bfdbfe';
  } else if (type.includes('TYPHOON')) {
    icon = '🌀';
    bannerBg = '#312e81';
    borderColor = '#818cf8';
    titleColor = '#c7d2fe';
  } else if (isSupply) {
    icon = '📦';
    bannerBg = '#064e3b';
    borderColor = '#10b981';
    titleColor = '#a7f3d0';
  }

  // Minimized floating pill mode
  if (isMinimized) {
    return (
      <TouchableOpacity
        style={[styles.minimizedPill, { borderColor, backgroundColor: bannerBg }]}
        onPress={() => setIsMinimized(false)}
        activeOpacity={0.8}
      >
        <Text style={styles.minimizedIcon}>{icon}</Text>
        <Text style={[styles.minimizedText, { color: titleColor }]}>
          ACTIVE {type} ALERT (Tap to expand)
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.bannerContainer, { backgroundColor: bannerBg, borderColor }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.alertIcon}>{icon}</Text>
          <View>
            <Text style={[styles.alertTitle, { color: titleColor }]}>
              {isSupply ? 'SUPPLY DROP ACTIVE' : `INCIDENT COMMAND: ${type} ALERT`}
            </Text>
            <Text style={styles.timestamp}>
              {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.minimizeBtn}
          onPress={() => setIsMinimized(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.minimizeText}>Minimize ✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.alertMessage}>"{alert.message}"</Text>

      <View style={styles.actionRow}>
        <Text style={styles.evacNotice}>
          🛡️ Follow official evacuation path to designated Safe Assembly Hubs.
        </Text>
        <TouchableOpacity
          style={styles.mapActionBtn}
          onPress={onPressViewMap}
          activeOpacity={0.7}
        >
          <Text style={styles.mapActionBtnText}>🗺️ View Routes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertIcon: {
    fontSize: 22,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  timestamp: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
    fontWeight: '600',
  },
  minimizeBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  minimizeText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  alertMessage: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 8,
  },
  evacNotice: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '500',
  },
  mapActionBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  mapActionBtnText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  minimizedPill: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimizedIcon: {
    fontSize: 14,
  },
  minimizedText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
