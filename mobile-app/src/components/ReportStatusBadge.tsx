import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ReportStatus } from '../types/report';

interface Props {
  status: ReportStatus;
  size?: 'small' | 'normal';
}

export const ReportStatusBadge: React.FC<Props> = ({ status, size = 'normal' }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'PENDING':
        return {
          icon: '⏳',
          label: 'Saved on Phone',
          bg: '#451a03',
          border: '#d97706',
          text: '#fde68a',
        };
      case 'SYNCING':
        return {
          icon: '🔄',
          label: 'Sending...',
          bg: '#0c4a6e',
          border: '#0284c7',
          text: '#bae6fd',
        };
      case 'SYNCED':
        return {
          icon: '✓',
          label: 'Sent to Dispatch',
          bg: '#064e3b',
          border: '#059669',
          text: '#a7f3d0',
        };
      case 'FAILED':
        return {
          icon: '!',
          label: 'Retry Required',
          bg: '#450a0a',
          border: '#dc2626',
          text: '#fecaca',
        };
      default:
        return {
          icon: '•',
          label: status,
          bg: '#1e293b',
          border: '#475569',
          text: '#cbd5e1',
        };
    }
  };

  const config = getBadgeConfig();
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          paddingVertical: isSmall ? 3 : 5,
          paddingHorizontal: isSmall ? 8 : 10,
        },
      ]}
    >
      <Text style={[styles.badgeIcon, { color: config.text }]}>{config.icon}</Text>
      <Text
        style={[
          styles.badgeText,
          {
            color: config.text,
            fontSize: isSmall ? 10 : 11,
          },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  badgeIcon: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeText: {
    fontWeight: '700',
  },
});
