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
          icon: '●',
          label: 'Saved Locally',
          bg: '#FFFBEB',
          border: '#FDE68A',
          text: '#B45309',
        };
      case 'SYNCING':
        return {
          icon: '●',
          label: 'Sending...',
          bg: '#F0F9FF',
          border: '#BAE6FD',
          text: '#0369A1',
        };
      case 'SYNCED':
        return {
          icon: '✓',
          label: 'Synced to MDRRMO',
          bg: '#F0FDF4',
          border: '#BBF7D0',
          text: '#15803D',
        };
      case 'FAILED':
        return {
          icon: '!',
          label: 'Retry Required',
          bg: '#FEF2F2',
          border: '#FECACA',
          text: '#B91C1C',
        };
      default:
        return {
          icon: '•',
          label: status,
          bg: '#F1F5F9',
          border: '#E2E8F0',
          text: '#475569',
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
    borderRadius: 6,
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
