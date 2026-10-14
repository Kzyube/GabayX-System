/**
 * GabayX Mobile - Disaster Alert Banner
 * Clean, human, highly legible emergency announcement card.
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

  // Clear, human color scheme and icon
  let icon = '⚠️';
  let bannerBg = '#450a0a'; // Deep burgundy red
  let borderColor = '#dc2626'; // Clear emergency red
  let title = `${type} ALERT`;

  if (type.includes('FIRE')) {
    icon = '🔥';
    bannerBg = '#431407';
    borderColor = '#ea580c';
    title = 'FIRE EMERGENCY';
  } else if (type.includes('EARTHQUAKE')) {
    icon = '🌋';
    bannerBg = '#451a03';
    borderColor = '#d97706';
    title = 'EARTHQUAKE ALERT';
  } else if (type.includes('FLOOD')) {
    icon = '🌊';
    bannerBg = '#172554';
    borderColor = '#2563eb';
    title = 'FLOOD WARNING';
  } else if (type.includes('TYPHOON')) {
    icon = '🌀';
    bannerBg = '#1e1b4b';
    borderColor = '#4f46e5';
    title = 'TYPHOON WARNING';
  } else if (isSupply) {
    icon = '📦';
    bannerBg = '#064e3b';
    borderColor = '#059669';
    title = 'RELIEF SUPPLIES AVAILABLE';
  }

  // Minimized state: Simple, unobtrusive bar
  if (isMinimized) {
    return (
      <TouchableOpacity
        style={[styles.minimizedPill, { borderColor, backgroundColor: bannerBg }]}
        onPress={() => setIsMinimized(false)}
        activeOpacity={0.8}
      >
        <Text style={styles.minimizedIcon}>{icon}</Text>
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
          <Text style={styles.icon}>{icon}</Text>
          <View>
            <Text style={styles.titleText}>{title}</Text>
            <Text style={styles.timeText}>Broadcasted at {timeString}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.hideBtn}
          onPress={() => setIsMinimized(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.hideBtnText}>Hide</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.messageText}>"{alert.message}"</Text>

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onPressViewMap}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>🗺️ View Evacuation Route</Text>
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
    borderRadius: 12,
    borderWidth: 1.5,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 20,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  timeText: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 1,
  },
  hideBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hideBtnText: {
    color: '#f1f5f9',
    fontSize: 11,
    fontWeight: '600',
  },
  messageText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  minimizedPill: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimizedIcon: {
    fontSize: 14,
  },
  minimizedText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
