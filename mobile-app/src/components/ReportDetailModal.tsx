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
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* OFFLINE NOTICE BANNER */}
            <View style={styles.noticeBanner}>
              <Text style={styles.noticeIcon}>⚠️</Text>
              <Text style={styles.noticeText}>
                {report.localStatus === 'SYNCED'
                  ? 'This report has been acknowledged by the central emergency dashboard.'
                  : 'This report is saved in device SQLite storage. It has NOT necessarily reached emergency responders yet until synced via internet or peer-to-peer relay.'}
              </Text>
            </View>

            {/* STATUS & SEVERITY ROW */}
            <View style={styles.metaRow}>
              <View>
                <Text style={styles.label}>LOCAL STATUS</Text>
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
                      : 'Not acquired (offline / no GPS fix)'}
                  </Text>
                </View>
                {report.accuracy !== null && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>GPS Accuracy:</Text>
                    <Text style={styles.infoVal}>±{Math.round(report.accuracy)}m</Text>
                  </View>
                )}
              </View>
            </View>

            {/* REPORTER INFO (SEPARATED FROM MESH BROADCAST) */}
            <View style={styles.section}>
              <Text style={styles.label}>REPORTER CONTACT (PRIVATE)</Text>
              <View style={styles.infoBox}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Mode:</Text>
                  <Text style={styles.infoVal}>
                    {report.contactInformation.isAnonymous ? 'Anonymous Citizen' : 'Identified'}
                  </Text>
                </View>
                {report.contactInformation.name && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>Reporter Name:</Text>
                    <Text style={styles.infoVal}>{report.contactInformation.name}</Text>
                  </View>
                )}
                {report.contactInformation.phone && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>Contact Phone:</Text>
                    <Text style={styles.infoVal}>{report.contactInformation.phone}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* AUDIT METADATA */}
            <View style={styles.section}>
              <Text style={styles.label}>STORAGE & AUDIT TRAIL</Text>
              <View style={styles.infoBox}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Report ID (UUID):</Text>
                  <Text style={[styles.infoVal, styles.monoText]}>{report.id}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Created At:</Text>
                  <Text style={styles.infoVal}>{formattedDate}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Relay Hops:</Text>
                  <Text style={styles.infoVal}>{report.meshHopCount} (Origin Device)</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Server Confirmed:</Text>
                  <Text style={styles.infoVal}>
                    {report.serverAcknowledgedAt ? report.serverAcknowledgedAt : 'Pending Sync'}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* FOOTER ACTIONS */}
          <View style={styles.footer}>
            {report.localStatus === 'PENDING' && onDelete && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => {
                  onDelete(report.id);
                  onClose();
                }}
              >
                <Text style={styles.deleteButtonText}>Delete Draft</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeActionBtn} onPress={onClose}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0c1712',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f1f5f9',
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 18,
  },
  bodyContent: {
    paddingVertical: 16,
    gap: 16,
  },
  noticeBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 10,
  },
  noticeIcon: {
    fontSize: 18,
  },
  noticeText: {
    flex: 1,
    color: '#fef3c7',
    fontSize: 11.5,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  severityBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  sev_CRITICAL: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  sev_HIGH: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
    borderColor: '#f97316',
  },
  sev_MEDIUM: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    borderColor: '#eab308',
  },
  sev_LOW: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3b82f6',
  },
  severityText: {
    color: '#f1f5f9',
    fontSize: 10,
    fontWeight: '800',
  },
  section: {
    gap: 4,
  },
  descriptionBox: {
    backgroundColor: '#060d09',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  descriptionText: {
    color: '#f1f5f9',
    fontSize: 13,
    lineHeight: 19,
  },
  infoBox: {
    backgroundColor: '#060d09',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoKey: {
    color: '#94a3b8',
    fontSize: 11,
  },
  infoVal: {
    color: '#f1f5f9',
    fontSize: 11,
    fontWeight: '600',
  },
  monoText: {
    fontSize: 9.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#10b981',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 12,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 12,
  },
  closeActionBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#10b981',
    alignItems: 'center',
  },
  closeActionText: {
    color: '#060d09',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
