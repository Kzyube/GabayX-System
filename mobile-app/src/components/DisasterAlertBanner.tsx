/**
 * GabayX Mobile - Disaster Alert Banner
 * Clean, civic, highly legible emergency announcement card.
 * Adheres to DESIGN.md and antislop guidelines.
 */

import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { DisasterAlert } from '../types/alert';
import { soundService } from '../services/soundService';

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

  // Authoritative Civic Emergency Palette: Solid, stress-resilient backgrounds
  let bannerBg = '#DC2626'; // Solid Critical Red
  let borderColor = '#B91C1C';
  let title = `${type} BROADCAST`;

  if (type.includes('FIRE')) {
    bannerBg = '#DC2626';
    borderColor = '#B91C1C';
    title = 'FIRE EMERGENCY ALERT';
  } else if (type.includes('EARTHQUAKE')) {
    bannerBg = '#D97706';
    borderColor = '#B45309';
    title = 'EARTHQUAKE ADVISORY';
  } else if (type.includes('FLOOD')) {
    bannerBg = '#0284C7';
    borderColor = '#0369A1';
    title = 'FLOOD WARNING ADVISORY';
  } else if (type.includes('TYPHOON')) {
    bannerBg = '#4F46E5';
    borderColor = '#4338CA';
    title = 'TYPHOON WARNING';
  } else if (isSupply) {
    bannerBg = '#0F766E';
    borderColor = '#115E59';
    title = 'RELIEF SUPPLIES NOTIFICATION';
  }

  // Minimized state: Simple, clean pill
  if (isMinimized) {
    return (
      <TouchableOpacity
        style={[styles.minimizedPill, { borderColor, backgroundColor: bannerBg }]}
        onPress={() => setIsMinimized(false)}
        activeOpacity={0.8}
        accessibilityLabel="Show active alert details"
      >
        <Text style={styles.minimizedText}>
          Active {title} (Tap to view details)
        </Text>
      </TouchableOpacity>
    );
  }

  const timeString = new Date(alert.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={[styles.container, { backgroundColor: bannerBg, borderColor }]}>
      <View style={styles.topRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.titleText}>{title}</Text>
          <Text style={styles.timeText}>Broadcasted at {timeString}</Text>
        </View>

        <TouchableOpacity
          style={styles.hideBtn}
          onPress={() => setIsMinimized(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Minimize alert"
        >
          <Text style={styles.hideBtnText}>Hide</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.messageText}>"{alert.message}"</Text>

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            soundService.stopEmergencySiren();
            onPressViewMap();
          }}
          activeOpacity={0.85}
          accessibilityLabel="View evacuation route"
        >
          <Text style={styles.actionBtnText}>View Evacuation Route</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.silenceBtn}
          onPress={() => soundService.stopEmergencySiren()}
          activeOpacity={0.8}
          accessibilityLabel="Silence siren"
        >
          <Text style={styles.silenceBtnText}>Silence Siren</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleGroup: {
    flex: 1,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  timeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    marginTop: 1,
    fontWeight: '500',
  },
  hideBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hideBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  actionBtnText: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '800',
  },
  silenceBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  silenceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  minimizedPill: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  minimizedText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
