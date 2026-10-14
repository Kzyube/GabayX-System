import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';

interface HotlinesModalProps {
  visible: boolean;
  onClose: () => void;
}

const EMERGENCY_CONTACTS = [
  {
    name: 'MDRRMO Kabacan Rescue',
    desc: 'Municipal Disaster Risk Reduction & Emergency Triage',
    number: '09123456789',
    formatted: '0912-345-6789 / (064) 248-2122',
    color: '#DC2626',
  },
  {
    name: 'BFP Kabacan Fire Station',
    desc: 'Bureau of Fire Protection & Rescue Dispatch',
    number: '09234567890',
    formatted: '0923-456-7890 / (064) 248-2160',
    color: '#EA580C',
  },
  {
    name: 'PNP Municipal Police Station',
    desc: 'Public Safety, Security & Patrol Assistance',
    number: '09985986701',
    formatted: '0998-598-6701 / 117',
    color: '#0284C7',
  },
  {
    name: 'Rural Health Unit (RHU) Ambulance',
    desc: 'Emergency Medical & Paramedic Transport',
    number: '09456789012',
    formatted: '0945-678-9012',
    color: '#16A34A',
  },
  {
    name: 'Philippine Red Cross Cotabato',
    desc: 'Disaster Relief Logistics & Blood Bank',
    number: '143',
    formatted: '143 / (064) 577-1422',
    color: '#B91C1C',
  },
];

export const HotlinesModal: React.FC<HotlinesModalProps> = ({ visible, onClose }) => {
  const handleCall = (num: string, name: string) => {
    const url = `tel:${num}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (!supported) {
          Alert.alert('Phone Call Not Supported', `Dial directly on keypad: ${num}`);
        } else {
          Linking.openURL(url);
        }
      })
      .catch(() => {
        Alert.alert('Dialer Error', `Please dial: ${num}`);
      });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Emergency Hotlines</Text>
              <Text style={styles.headerSub}>Municipality of Kabacan, Cotabato</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7} accessibilityLabel="Close hotlines">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.offlineNotice}>
            <Text style={styles.offlineNoticeText}>
              Direct cellular lines function even during internet blackouts.
            </Text>
          </View>

          <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
            {EMERGENCY_CONTACTS.map((item, idx) => (
              <View key={idx} style={styles.contactCard}>
                <View style={styles.infoCol}>
                  <Text style={styles.contactName}>{item.name}</Text>
                  <Text style={styles.contactDesc}>{item.desc}</Text>
                  <Text style={styles.contactNumber}>{item.formatted}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.callBtn, { backgroundColor: item.color }]}
                  onPress={() => handleCall(item.number, item.name)}
                  activeOpacity={0.85}
                  accessibilityLabel={`Call ${item.name}`}
                >
                  <Text style={styles.callBtnText}>Call</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Close Directory</Text>
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
    marginBottom: 8,
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
  offlineNotice: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  offlineNoticeText: {
    color: '#475569',
    fontSize: 11.5,
    lineHeight: 16,
  },
  scrollList: {
    marginBottom: 14,
  },
  contactCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
    paddingRight: 10,
  },
  contactName: {
    color: '#0F172A',
    fontSize: 13.5,
    fontWeight: '700',
  },
  contactDesc: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
  },
  contactNumber: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  callBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  doneBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 48,
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
});
