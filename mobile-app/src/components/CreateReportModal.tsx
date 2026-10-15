/**
 * GabayX Mobile - Emergency Incident Report Modal
 * Streamlined civic emergency form: Details of the Report, Priority Risk, Landmark.
 * Aligned with DESIGN.md and offline-first SQLite synchronization.
 */

import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Vibration,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import {
  CreateReportInput,
  ReportCategory,
  ReportSeverity,
  validateReportInput,
} from '../types/report';
import { COMMUNITY_FACILITIES } from '../constants/geoData';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: CreateReportInput) => Promise<void>;
}

const SEVERITIES: { label: string; value: ReportSeverity; color: string; desc: string }[] = [
  {
    label: 'Extreme',
    value: 'EXTREME',
    color: '#DC2626',
    desc: '🚨 Extreme Risk: Life-threatening danger, trapped residents, or critical rescue needed.',
  },
  {
    label: 'High',
    value: 'HIGH',
    color: '#EA580C',
    desc: '⚠️ High Risk: Serious injury, active fire, or structural hazard requiring prompt dispatch.',
  },
  {
    label: 'Medium',
    value: 'MEDIUM',
    color: '#D97706',
    desc: '⚡ Medium Risk: Moderate incident requiring responder attention and monitoring.',
  },
  {
    label: 'Low',
    value: 'LOW',
    color: '#16A34A',
    desc: 'ℹ️ Low Risk: Minor incident, non-urgent assistance, or advisory observation.',
  },
];

export const CreateReportModal: React.FC<Props> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<ReportSeverity>('EXTREME');
  const [nearestBuilding, setNearestBuilding] = useState('Municipal Hall');

  // Location
  const [isLocating, setIsLocating] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('GPS not pinned');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedSeverityObj =
    SEVERITIES.find((s) => s.value === severity || (s.value === 'EXTREME' && severity === 'CRITICAL')) ||
    SEVERITIES[0];

  const resetForm = () => {
    setDescription('');
    setSeverity('EXTREME');
    setNearestBuilding('Municipal Hall');
    setLatitude(null);
    setLongitude(null);
    setAccuracy(null);
    setLocationStatus('GPS not pinned');
    setErrorMessage(null);
  };

  const handleAcquireLocation = async () => {
    setIsLocating(true);
    setLocationStatus('Acquiring GPS coordinates...');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('GPS permission denied (optional)');
        setIsLocating(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitude(location.coords.latitude);
      setLongitude(location.coords.longitude);
      setAccuracy(location.coords.accuracy);
      setLocationStatus(
        `📍 GPS: ${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`
      );
    } catch {
      // Fast fallback to last known
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last?.coords) {
          setLatitude(last.coords.latitude);
          setLongitude(last.coords.longitude);
          setAccuracy(last.coords.accuracy);
          setLocationStatus(
            `📍 GPS: ${last.coords.latitude.toFixed(5)}, ${last.coords.longitude.toFixed(5)}`
          );
          return;
        }
      } catch {}
      setLocationStatus('GPS unavailable (report will save with landmark)');
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    try {
      Vibration.vibrate(60);
    } catch {}

    const trimmedDesc = description.trim();
    const finalDescription =
      trimmedDesc.length >= 5
        ? trimmedDesc
        : `Emergency incident reported near ${nearestBuilding || 'Kabacan Poblacion'}. Priority: ${severity}. Immediate responder assistance requested.`;

    let finalLat = latitude;
    let finalLng = longitude;
    let finalAcc = accuracy;

    // Auto-attach location if not explicitly pinned
    if (finalLat === null || finalLng === null) {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown?.coords) {
          finalLat = lastKnown.coords.latitude;
          finalLng = lastKnown.coords.longitude;
          finalAcc = lastKnown.coords.accuracy;
        }
      } catch {}
    }

    // Auto-detect category from description for backend classification
    let derivedCategory: ReportCategory = 'GENERAL';
    const lower = finalDescription.toLowerCase();
    if (lower.includes('fire')) derivedCategory = 'FIRE';
    else if (lower.includes('quake') || lower.includes('tremor') || lower.includes('collapse')) derivedCategory = 'EARTHQUAKE';
    else if (lower.includes('flood') || lower.includes('water')) derivedCategory = 'FLOOD';
    else if (lower.includes('medic') || lower.includes('injur') || lower.includes('wound') || lower.includes('blood')) derivedCategory = 'MEDICAL';
    else if (lower.includes('trap')) derivedCategory = 'TRAPPED';
    else if (lower.includes('wire') || lower.includes('hazard') || lower.includes('gas')) derivedCategory = 'HAZARD';

    const payload: CreateReportInput = {
      category: derivedCategory,
      severity,
      description: finalDescription,
      latitude: finalLat,
      longitude: finalLng,
      accuracy: finalAcc,
      nearestBuilding: nearestBuilding.trim() || 'Central Poblacion Zone',
      contactInformation: {
        isAnonymous: true,
      },
    };

    const validation = validateReportInput(payload);
    if (!validation.valid) {
      const err = validation.errors.join('\n');
      setErrorMessage(err);
      Alert.alert('Required Information', err);
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(payload);
      resetForm();
      onClose();
    } catch (err) {
      console.error('[CreateReportModal] Submit failed:', err);
      const errText = err instanceof Error ? err.message : 'Failed to save emergency report.';
      setErrorMessage(errText);
      Alert.alert('Submission Error', errText);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          <View style={styles.modalContainer}>
            {/* HEADER */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerSubtitle}>MUNICIPALITY OF KABACAN • MDRRMO</Text>
                <Text style={styles.headerTitle}>Report Emergency Incident</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  resetForm();
                  onClose();
                }}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Close report form"
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {/* ERROR DISPLAY */}
              {errorMessage && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* 1. DETAILS OF THE REPORT */}
              <View style={styles.formGroup}>
                <Text style={styles.sectionLabel}>
                  DETAILS OF THE REPORT <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.textInputArea}
                  placeholder="Describe what happened, injuries, trapped residents, or assistance needed..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  value={description}
                  onChangeText={setDescription}
                  autoCapitalize="sentences"
                  returnKeyType="default"
                />
                <View style={styles.descHelperRow}>
                  <Text style={styles.descHelperText}>
                    {description.trim().length === 0
                      ? '💡 Tap to type details, or leave blank to auto-use summary'
                      : 'Custom details provided'}
                  </Text>
                  <Text style={styles.characterCount}>
                    {description.length} / 2000
                  </Text>
                </View>
              </View>

              {/* 2. PRIORITY RISK */}
              <View style={styles.formGroup}>
                <Text style={styles.sectionLabel}>
                  PRIORITY RISK <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.severityRow}>
                  {SEVERITIES.map((sev) => {
                    const isSelected =
                      severity === sev.value ||
                      (sev.value === 'EXTREME' && severity === 'CRITICAL');
                    return (
                      <TouchableOpacity
                        key={sev.value}
                        style={[
                          styles.severityButton,
                          isSelected && {
                            borderColor: sev.color,
                            backgroundColor: `${sev.color}15`,
                            borderWidth: 2,
                          },
                        ]}
                        onPress={() => setSeverity(sev.value)}
                        activeOpacity={0.8}
                        accessibilityLabel={`Priority ${sev.label}`}
                      >
                        <Text
                          style={[
                            styles.severityButtonText,
                            isSelected && { color: sev.color, fontWeight: '800' },
                          ]}
                        >
                          {sev.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Dynamic Priority Risk Guide */}
                {selectedSeverityObj && (
                  <View
                    style={[
                      styles.priorityGuideline,
                      {
                        borderColor: `${selectedSeverityObj.color}35`,
                        backgroundColor: `${selectedSeverityObj.color}0D`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.priorityGuidelineText,
                        { color: selectedSeverityObj.color },
                      ]}
                    >
                      {selectedSeverityObj.desc}
                    </Text>
                  </View>
                )}
              </View>

              {/* 3. LANDMARK */}
              <View style={styles.formGroup}>
                <View style={styles.landmarkHeaderRow}>
                  <Text style={styles.sectionLabel}>
                    LANDMARK <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.gpsSmallBtn}
                    onPress={handleAcquireLocation}
                    disabled={isLocating}
                    activeOpacity={0.8}
                  >
                    {isLocating ? (
                      <ActivityIndicator size="small" color="#0F766E" />
                    ) : (
                      <Text style={styles.gpsSmallBtnText}>📡 Pin GPS</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Fast Landmark facility chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.facilityScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {COMMUNITY_FACILITIES.slice(0, 8).map((fac) => {
                    const isSelected = nearestBuilding === fac.name;
                    return (
                      <TouchableOpacity
                        key={fac.id}
                        style={[styles.facilityChip, isSelected && styles.facilityChipActive]}
                        onPress={() => setNearestBuilding(fac.name)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.facilityChipText, isSelected && styles.facilityChipTextActive]}>
                          {fac.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  placeholder="Specify street, barangay, or landmark..."
                  placeholderTextColor="#94A3B8"
                  value={nearestBuilding}
                  onChangeText={setNearestBuilding}
                />
                <Text style={styles.gpsStatusText}>{locationStatus}</Text>
              </View>
            </ScrollView>

            {/* INLINE FOOTER ERROR (ALWAYS VISIBLE ABOVE SUBMIT BUTTON) */}
            {errorMessage && (
              <View style={styles.footerErrorBox}>
                <Text style={styles.footerErrorText}>⚠️ {errorMessage}</Text>
              </View>
            )}

            {/* FOOTER ACTION BUTTONS */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  resetForm();
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmit}
                disabled={isSubmitting}
                activeOpacity={0.85}
                accessibilityLabel="Send emergency report"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>Send Emergency Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: '92%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  body: {
    flexGrow: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  required: {
    color: '#DC2626',
    fontWeight: '800',
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  severityButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  priorityGuideline: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityGuidelineText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  textInputArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    color: '#0F172A',
    fontSize: 13.5,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  descHelperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  descHelperText: {
    fontSize: 10.5,
    color: '#0F766E',
    fontWeight: '600',
  },
  characterCount: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'right',
  },
  landmarkHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gpsSmallBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#0F766E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gpsSmallBtnText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  facilityScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  facilityChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  facilityChipActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  facilityChipText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
  },
  facilityChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 11,
    color: '#0F172A',
    fontSize: 13,
    minHeight: 44,
  },
  gpsStatusText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  footerErrorBox: {
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  footerErrorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    minHeight: 48,
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
    letterSpacing: 0.3,
  },
});
