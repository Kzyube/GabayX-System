import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import { GabayXReport } from '../types/report';
import { ReportStatusBadge } from './ReportStatusBadge';

interface Props {
  report: GabayXReport | null;
  visible: boolean;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export const ReportDetailModal: React.FC<Props> = ({
  report,
  visible,
  onClose,
  onDelete,
}) => {
  if (!report) return null;

  const formattedDate = new Date(report.createdAt).toLocaleString();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* HEADER */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerSubtitle}>EMERGENCY REPORT DETAIL</Text>
              <Text style={styles.headerTitle}>{report.category}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close report details">
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* OFFLINE NOTICE BANNER */}
            <View style={styles.noticeBanner}>
              <Text style={styles.noticeText}>
                {report.localStatus === 'SYNCED'
                  ? 'This report has been acknowledged and synchronized with MDRRMO Central Dispatch.'
                  : 'This report is securely saved in device SQLite storage. It will auto-synchronize once connection to MDRRMO Central Dispatch is restored.'}
              </Text>
            </View>

            {/* STATUS & SEVERITY ROW */}
            <View style={styles.metaRow}>
              <View>
                <Text style={styles.label}>DISPATCH STATUS</Text>
                <ReportStatusBadge status={report.localStatus} />
              </View>
              <View style={styles.alignRight}>
                <Text style={styles.label}>SEVERITY</Text>
                <View style={[styles.severityBadge, styles[`sev_${report.severity}`]]}>
                  <Text style={styles.severityText}>{report.severity}</Text>
                </View>
              </View>
            </View>

            {/* DESCRIPTION */}
            <View style={styles.section}>
              <Text style={styles.label}>INCIDENT DESCRIPTION</Text>
              <View style={styles.descriptionBox}>
                <Text style={styles.descriptionText}>{report.description}</Text>
              </View>
            </View>

            {/* GEOSPATIAL LOCATION */}
            <View style={styles.section}>
              <Text style={styles.label}>LOCATION & PROXIMITY</Text>
              <View style={styles.infoBox}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Community Landmark:</Text>
                  <Text style={styles.infoVal}>{report.nearestBuilding}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>GPS Coordinates:</Text>
                  <Text style={styles.infoVal}>
                    {report.latitude !== null && report.longitude !== null
                      ? `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`
                      : 'Not acquired (offline / manual)'}
                  </Text>
                </View>
                {report.accuracy !== null && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>GPS Accuracy:</Text>
                    <Text style={styles.infoVal}>±{Math.round(report.accuracy)} meters</Text>
                  </View>
                )}
              </View>
            </View>

            {/* CONTACT INFORMATION */}
            <View style={styles.section}>
              <Text style={styles.label}>REPORTER INFORMATION</Text>
              <View style={styles.infoBox}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Mode:</Text>
                  <Text style={styles.infoVal}>
                    {report.contactInformation.isAnonymous ? 'Anonymous Resident' : 'Named Citizen'}
                  </Text>
                </View>
                {!report.contactInformation.isAnonymous && report.contactInformation.name && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>Name:</Text>
                    <Text style={styles.infoVal}>{report.contactInformation.name}</Text>
                  </View>
                )}
                {!report.contactInformation.isAnonymous && report.contactInformation.phone && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>Contact Phone:</Text>
                    <Text style={styles.infoVal}>{report.contactInformation.phone}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Reported At:</Text>
                  <Text style={styles.infoVal}>{formattedDate}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Report Reference ID:</Text>
                  <Text style={styles.monoText}>{report.id}</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* FOOTER ACTIONS */}
          <View style={styles.footer}>
            {onDelete && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => {
                  Alert.alert(
                    'Delete Report',
                    'Are you sure you want to permanently delete this report from your device?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          onDelete(report.id);
                          onClose();
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteButtonText}>Delete Report</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeActionBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.closeActionText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  closeButton: {
    backgroundColor: '#F1F5F9',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingVertical: 16,
  },
  noticeBanner: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  noticeText: {
    color: '#475569',
    fontSize: 11.5,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  sev_CRITICAL: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  sev_EXTREME: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  sev_HIGH: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFEDD5',
  },
  sev_MEDIUM: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },
  sev_LOW: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  severityText: {
    fontWeight: '800',
    fontSize: 11,
    color: '#0F172A',
  },
  section: {
    marginBottom: 14,
  },
  descriptionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  descriptionText: {
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 19,
  },
  infoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoKey: {
    color: '#64748B',
    fontSize: 11.5,
  },
  infoVal: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '600',
  },
  monoText: {
    fontSize: 10.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#0F766E',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    minHeight: 48,
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 12.5,
  },
  closeActionBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  closeActionText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 13,
  },
});
