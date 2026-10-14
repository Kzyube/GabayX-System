import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GCashVoucher } from '../types/voucher';

interface VoucherAlertModalProps {
  visible: boolean;
  voucher: GCashVoucher | null;
  onClose: () => void;
  onViewAllVouchers: () => void;
}

export const VoucherAlertModal: React.FC<VoucherAlertModalProps> = ({
  visible,
  voucher,
  onClose,
  onViewAllVouchers,
}) => {
  const [copied, setCopied] = useState(false);

  if (!voucher) return null;

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(voucher.voucherCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>RELIEF AID RECEIVED</Text>
          </View>

          <Text style={styles.title}>Aid Funds Deployed</Text>
          <Text style={styles.subtitle}>
            A community donor ({voucher.donorName}) has deployed relief funds to your area.
          </Text>

          {/* Clean Voucher Code Ticket */}
          <View style={styles.voucherBox}>
            <Text style={styles.voucherLabel}>VOUCHER CLAIM CODE</Text>
            <Text style={styles.voucherCode}>{voucher.voucherCode}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7} accessibilityLabel="Copy voucher code">
              <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy Code'}</Text>
            </TouchableOpacity>
          </View>

          {/* Details Row */}
          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>VALUE</Text>
              <Text style={styles.metaVal}>₱{voucher.amount.toFixed(2)}</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>BENEFICIARY</Text>
              <Text style={styles.metaVal}>{voucher.personsCount} Person(s)</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>TARGET</Text>
              <Text style={styles.metaVal}>{voucher.targetZone}</Text>
            </View>
          </View>

          <Text style={styles.instruction}>
            Present this code to MDRRMO relief distribution volunteers or barangay officers to claim supplies.
          </Text>

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={onViewAllVouchers} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>View In Wallet</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.secondaryBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 10,
  },
  badgeText: {
    color: '#15803D',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
  voucherBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0F766E',
    padding: 14,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 12,
  },
  voucherLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  voucherCode: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F766E',
    fontFamily: 'monospace',
    letterSpacing: 2,
    marginBottom: 8,
  },
  copyBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  copyBtnText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  metaCol: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  metaVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  instruction: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 14,
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 44,
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
