import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { GCashVoucher } from '../types/voucher';
import { alertService } from '../services/alertService';

interface DonateModalProps {
  visible: boolean;
  onClose: () => void;
  onDonationSuccess?: (voucher: GCashVoucher) => void;
}

const PRESET_AMOUNTS = [150, 300, 500, 1000, 2500];
const PERSON_OPTIONS = [
  { count: 1, label: '1 Person', desc: 'Meal & emergency kit' },
  { count: 2, label: '2 Persons', desc: 'Family food relief' },
  { count: 5, label: '5 Persons', desc: 'Household care pack' },
  { count: 10, label: '10 Persons', desc: 'Community supply pack' },
];

export const DonateModal: React.FC<DonateModalProps> = ({
  visible,
  onClose,
  onDonationSuccess,
}) => {
  const [donorName, setDonorName] = useState('');
  const [amount, setAmount] = useState('500');
  const [personsCount, setPersonsCount] = useState(2);
  const [targetZone, setTargetZone] = useState('ALL ZONES');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successVoucher, setSuccessVoucher] = useState<GCashVoucher | null>(null);

  const handleSelectAmount = (val: number) => {
    setAmount(String(val));
    const calculatedPersons = Math.max(1, Math.round(val / 250));
    setPersonsCount(calculatedPersons);
  };

  const handleResetAndClose = () => {
    setSuccessVoucher(null);
    setIsSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid donation amount in PHP.');
      return;
    }

    setIsSubmitting(true);
    try {
      const voucher = await alertService.submitDonation({
        amount: numAmount,
        personsCount: personsCount || 1,
        donorName: donorName.trim() || 'Anonymous Donor',
        targetZone: targetZone,
      });

      setSuccessVoucher(voucher);
      if (onDonationSuccess) {
        onDonationSuccess(voucher);
      }
    } catch (err: any) {
      Alert.alert('Notice', err?.message || 'Could not process donation at this time.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleResetAndClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Deploy Relief Aid</Text>
              <Text style={styles.headerSubtitle}>Community Disaster Support • GCash Voucher</Text>
            </View>
            <TouchableOpacity onPress={handleResetAndClose} style={styles.closeBtn} activeOpacity={0.7} accessibilityLabel="Close modal">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {successVoucher ? (
            /* SUCCESS CONFIRMATION VIEW */
            <ScrollView contentContainerStyle={styles.successContainer}>
              <View style={styles.successIconBox}>
                <Text style={styles.successCheck}>✓</Text>
              </View>

              <Text style={styles.successTitle}>Relief Aid Deployed</Text>
              <Text style={styles.successSub}>
                Your donation voucher has been generated and broadcasted to community residents in need.
              </Text>

              <View style={styles.voucherBox}>
                <Text style={styles.voucherBoxLabel}>VOUCHER CLAIM CODE</Text>
                <Text style={styles.voucherCodeText}>{successVoucher.voucherCode}</Text>
                <View style={styles.voucherDivider} />
                <View style={styles.voucherDetailsRow}>
                  <View>
                    <Text style={styles.detailLabel}>AMOUNT</Text>
                    <Text style={styles.detailValue}>₱{successVoucher.amount.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text style={styles.detailLabel}>BENEFICIARIES</Text>
                    <Text style={styles.detailValue}>Good for {successVoucher.personsCount} Person(s)</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailLabel}>TARGET</Text>
                    <Text style={styles.detailValue}>{successVoucher.targetZone}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.doneBtn} onPress={handleResetAndClose} activeOpacity={0.85}>
                <Text style={styles.doneBtnText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* FORM INPUT VIEW */
            <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
              {/* Preset Amounts */}
              <Text style={styles.inputLabel}>SELECT AMOUNT (PHP)</Text>
              <View style={styles.presetsGrid}>
                {PRESET_AMOUNTS.map((val) => {
                  const isSelected = amount === String(val);
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[styles.presetBtn, isSelected && styles.presetBtnActive]}
                      onPress={() => handleSelectAmount(val)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.presetBtnText, isSelected && styles.presetBtnTextActive]}>
                        ₱{val}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom Amount */}
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={amount}
                onChangeText={(text) => {
                  setAmount(text);
                  const num = parseFloat(text);
                  if (!isNaN(num) && num > 0) {
                    setPersonsCount(Math.max(1, Math.round(num / 250)));
                  }
                }}
                placeholder="Enter custom amount (₱)"
                placeholderTextColor="#94A3B8"
              />

              {/* Persons Coverage */}
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>RELIEF COVERAGE</Text>
              <View style={styles.coverageRow}>
                {PERSON_OPTIONS.map((item) => {
                  const isSelected = personsCount === item.count;
                  return (
                    <TouchableOpacity
                      key={item.count}
                      style={[styles.coveragePill, isSelected && styles.coveragePillActive]}
                      onPress={() => setPersonsCount(item.count)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.coveragePillText, isSelected && styles.coveragePillTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Donor Name */}
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>DONOR NAME (OPTIONAL)</Text>
              <TextInput
                style={styles.textInput}
                value={donorName}
                onChangeText={setDonorName}
                placeholder="e.g. Juan Dela Cruz / Anonymous"
                placeholderTextColor="#94A3B8"
              />

              {/* Target Zone */}
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>TARGET BARANGAY / ZONE</Text>
              <View style={styles.coverageRow}>
                {['ALL ZONES', 'POBLACION', 'KATIPUNAN', 'OSIAS'].map((zone) => {
                  const isSelected = targetZone === zone;
                  return (
                    <TouchableOpacity
                      key={zone}
                      style={[styles.coveragePill, isSelected && styles.coveragePillActive]}
                      onPress={() => setTargetZone(zone)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.coveragePillText, isSelected && styles.coveragePillTextActive]}>
                        {zone}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>Civic Verification</Text>
                <Text style={styles.noticeText}>
                  Relief aid generates unique serial vouchers verifiable at MDRRMO assistance centers.
                </Text>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmit}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>
                  {isSubmitting ? 'Deploying...' : `Deploy ₱${amount || '0'} Relief Voucher`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
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
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    maxHeight: '88%',
  },
  header: {
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
  headerSubtitle: {
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
  closeText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  formScroll: {
    marginBottom: 8,
  },
  inputLabel: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  presetsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetBtnActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  presetBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  presetBtnTextActive: {
    color: '#FFFFFF',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    minHeight: 44,
  },
  coverageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  coveragePill: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  coveragePillActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  coveragePillText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '700',
  },
  coveragePillTextActive: {
    color: '#FFFFFF',
  },
  noticeBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 10,
    marginTop: 14,
  },
  noticeTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#15803D',
  },
  noticeText: {
    fontSize: 11,
    color: '#166534',
    marginTop: 2,
    lineHeight: 15,
  },
  submitBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // SUCCESS VIEW
  successContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  successIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successCheck: {
    fontSize: 24,
    color: '#15803D',
    fontWeight: '900',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  successSub: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  voucherBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0F766E',
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  voucherBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  voucherCodeText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F766E',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  voucherDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  voucherDetailsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  doneBtn: {
    width: '100%',
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
