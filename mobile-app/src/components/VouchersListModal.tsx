import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GCashVoucher } from '../types/voucher';
import { voucherRepository } from '../database/voucherRepository';

interface VouchersListModalProps {
  visible: boolean;
  vouchers: GCashVoucher[];
  onClose: () => void;
  onRefreshVouchers: () => void;
  onOpenDonateModal: () => void;
}

export const VouchersListModal: React.FC<VouchersListModalProps> = ({
  visible,
  vouchers,
  onClose,
  onRefreshVouchers,
  onOpenDonateModal,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCode = async (code: string, id: string) => {
    try {
      await Clipboard.setStringAsync(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleToggleClaim = async (v: GCashVoucher) => {
    if (v.isClaimed) return;
    Alert.alert(
      'Mark as Redeemed?',
      `Confirm redemption of voucher ${v.voucherCode}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Redeemed',
          onPress: async () => {
            await voucherRepository.markClaimed(v.id);
            onRefreshVouchers();
          },
        },
      ]
    );
  };

  const unclaimedCount = vouchers.filter((v) => !v.isClaimed).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Relief Vouchers</Text>
              <Text style={styles.headerSub}>
                {unclaimedCount} ready to claim • {vouchers.length} total
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7} accessibilityLabel="Close vouchers list">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Vouchers List */}
          {vouchers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Vouchers Received</Text>
              <Text style={styles.emptySub}>
                When relief assistance is deployed by donors or MDRRMO, claim vouchers will appear here.
              </Text>
              <TouchableOpacity style={styles.emptyDonateBtn} onPress={onOpenDonateModal} activeOpacity={0.85}>
                <Text style={styles.emptyDonateBtnText}>Deploy Relief Aid as Donor</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={vouchers}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item: v }) => {
                const isCopied = copiedId === v.id;
                return (
                  <View style={[styles.card, v.isClaimed && styles.cardClaimed]}>
                    <View style={styles.cardTop}>
                      <View>
                        <Text style={styles.codeLabel}>VOUCHER CODE</Text>
                        <Text style={styles.codeText}>{v.voucherCode}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={() => handleCopyCode(v.voucherCode, v.id)}
                        activeOpacity={0.7}
                        accessibilityLabel="Copy voucher code"
                      >
                        <Text style={styles.copyBtnText}>{isCopied ? 'Copied' : 'Copy'}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.cardDivider} />

                    <View style={styles.cardMeta}>
                      <View>
                        <Text style={styles.metaLabel}>AMOUNT</Text>
                        <Text style={styles.metaVal}>₱{v.amount.toFixed(2)}</Text>
                      </View>
                      <View>
                        <Text style={styles.metaLabel}>BENEFICIARY</Text>
                        <Text style={styles.metaVal}>{v.personsCount} Person(s)</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.metaLabel}>STATUS</Text>
                        <Text style={[styles.statusBadge, v.isClaimed ? styles.statusClaimed : styles.statusUnclaimed]}>
                          {v.isClaimed ? 'Redeemed' : 'Ready to Claim'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardBottom}>
                      <Text style={styles.donorText}>
                        Donor: {v.donorName} • Zone: {v.targetZone}
                      </Text>
                      {!v.isClaimed && (
                        <TouchableOpacity onPress={() => handleToggleClaim(v)} style={styles.claimLink}>
                          <Text style={styles.claimLinkText}>Mark Redeemed</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}

          <TouchableOpacity style={styles.donateBtn} onPress={onOpenDonateModal} activeOpacity={0.85}>
            <Text style={styles.donateBtnText}>+ Deploy Relief Aid as Donor</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSub: {
    color: '#475569',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 10,
  },
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  cardClaimed: {
    opacity: 0.65,
    backgroundColor: '#F1F5F9',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  codeText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F766E',
    fontFamily: 'monospace',
    letterSpacing: 1,
    marginTop: 2,
  },
  copyBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  copyBtnText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  statusBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 2,
  },
  statusUnclaimed: {
    backgroundColor: '#F0FDF4',
    color: '#15803D',
  },
  statusClaimed: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  donorText: {
    fontSize: 10.5,
    color: '#64748B',
    flex: 1,
  },
  claimLink: {
    paddingVertical: 2,
  },
  claimLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 20,
    lineHeight: 17,
  },
  emptyDonateBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyDonateBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  donateBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  donateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
