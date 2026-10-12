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
          label: 'SAVED LOCALLY (OFFLINE)',
          bg: 'rgba(245, 158, 11, 0.15)',
          border: '#f59e0b',
          text: '#fbbf24',
        };
      case 'SYNCING':
        return {
          label: 'SYNCING...',
          bg: 'rgba(6, 182, 212, 0.15)',
          border: '#06b6d4',
          text: '#22d3ee',
        };
      case 'SYNCED':
        return {
          label: 'SERVER ACKNOWLEDGED',
          bg: 'rgba(16, 185, 129, 0.15)',
          border: '#10b981',
          text: '#34d399',
        };
      case 'FAILED':
        return {
          label: 'SYNC FAILED',
          bg: 'rgba(239, 68, 68, 0.15)',
          border: '#ef4444',
          text: '#f87171',
        };
      default:
        return {
          label: status,
          bg: 'rgba(148, 163, 184, 0.15)',
          border: '#94a3b8',
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
          paddingVertical: isSmall ? 2 : 4,
          paddingHorizontal: isSmall ? 6 : 8,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          {
            color: config.text,
            fontSize: isSmall ? 8.5 : 9.5,
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
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
