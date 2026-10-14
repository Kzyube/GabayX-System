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
  Switch,
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

const CATEGORIES: { label: string; value: ReportCategory; color: string }[] = [
  { label: 'Medical', value: 'MEDICAL', color: '#DC2626' },
  { label: 'Fire', value: 'FIRE', color: '#EA580C' },
  { label: 'Flood', value: 'FLOOD', color: '#0284C7' },
  { label: 'Earthquake', value: 'EARTHQUAKE', color: '#D97706' },
  { label: 'Trapped', value: 'TRAPPED', color: '#B91C1C' },
  { label: 'Hazard', value: 'HAZARD', color: '#CA8A04' },
];

const SEVERITIES: { label: string; value: ReportSeverity; color: string }[] = [
  { label: 'Critical', value: 'CRITICAL', color: '#DC2626' },
  { label: 'High', value: 'HIGH', color: '#EA580C' },
  { label: 'Medium', value: 'MEDIUM', color: '#D97706' },
  { label: 'Low', value: 'LOW', color: '#16A34A' },
];

const QUICK_PRESETS = [
  {
    title: 'Medical Triage',
    category: 'MEDICAL' as ReportCategory,
    severity: 'CRITICAL' as ReportSeverity,
    text: 'Injured resident requiring emergency ambulance and paramedic assistance.',
  },
  {
    title: 'Structure Fire',
    category: 'FIRE' as ReportCategory,
    severity: 'HIGH' as ReportSeverity,
    text: 'Active structure fire spreading rapidly. Evacuation in progress.',
  },
  {
    title: 'Flood Rescue',
    category: 'FLOOD' as ReportCategory,
    severity: 'HIGH' as ReportSeverity,
    text: 'Rising flood waters trapped residents. Need evacuation transport.',
  },
  {
    title: 'Structural Damage',
    category: 'EARTHQUAKE' as ReportCategory,
    severity: 'HIGH' as ReportSeverity,
    text: 'Structural damage and partial collapse from earthquake tremors.',
  },
];

export const CreateReportModal: React.FC<Props> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const [category, setCategory] = useState<ReportCategory>('MEDICAL');
  const [severity, setSeverity] = useState<ReportSeverity>('HIGH');
  const [description, setDescription] = useState('');
  const [nearestBuilding, setNearestBuilding] = useState('Municipal Hall');
  
  // Location
  const [isLocating, setIsLocating] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('GPS not acquired');

  // Contact Info
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setCategory('MEDICAL');
    setSeverity('HIGH');
    setDescription('');
    setNearestBuilding('Municipal Hall');
    setLatitude(null);
    setLongitude(null);
    setAccuracy(null);
    setLocationStatus('GPS not acquired');
    setIsAnonymous(true);
    setReporterName('');
    setReporterPhone('');
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
        `GPS: ${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)} (±${Math.round(location.coords.accuracy || 0)}m)`
      );
    } catch (err) {
      setLocationStatus('GPS unavailable (report will save without coordinates)');
    } finally {
      setIsLocating(false);
    }
  };

  const handleApplyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    setCategory(preset.category);
    setSeverity(preset.severity);
    setDescription(preset.text);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    const payload: CreateReportInput = {
      category,
      severity,
      description,
      latitude,
      longitude,
      accuracy,
      nearestBuilding,
      contactInformation: {
        isAnonymous,
        name: isAnonymous ? null : reporterName.trim() || null,
        phone: isAnonymous ? null : reporterPhone.trim() || null,
      },
    };

    const validation = validateReportInput(payload);
    if (!validation.valid) {
      setErrorMessage(validation.errors.join(' '));
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(payload);
      resetForm();
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save report.');
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
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close report form"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* STATUS ASSURANCE BANNER */}
            <View style={styles.assuranceBanner}>
              <Text style={styles.assuranceText}>
                Offline-Ready: Saved permanently in device SQLite storage and auto-dispatched to MDRRMO Central Command.
              </Text>
            </View>

            {/* ERROR DISPLAY */}
            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            {/* QUICK PRESET TEMPLATES */}
            <View style={styles.formGroup}>
              <Text style={styles.sectionLabel}>QUICK INCIDENT TEMPLATES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
                {QUICK_PRESETS.map((preset, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.presetChip}
                    onPress={() => handleApplyPreset(preset)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.presetChipText}>{preset.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* 1. INCIDENT CATEGORY */}
            <View style={styles.formGroup}>
              <Text style={styles.sectionLabel}>
                INCIDENT TYPE <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat.value;
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      style={[
                        styles.categoryBtn,
                        isSelected && { borderColor: cat.color, backgroundColor: `${cat.color}12` },
                      ]}
                      onPress={() => setCategory(cat.value)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.categoryBtnLabel,
                          isSelected && { color: cat.color, fontWeight: '800' },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. SEVERITY */}
            <View style={styles.formGroup}>
              <Text style={styles.sectionLabel}>SEVERITY LEVEL</Text>
              <View style={styles.severityRow}>
                {SEVERITIES.map((sev) => {
                  const isSelected = severity === sev.value;
                  return (
                    <TouchableOpacity
                      key={sev.value}
                      style={[
                        styles.severityButton,
                        isSelected && { borderColor: sev.color, backgroundColor: `${sev.color}15` },
                      ]}
                      onPress={() => setSeverity(sev.value)}
                      activeOpacity={0.8}
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
            </View>

            {/* 3. INCIDENT DESCRIPTION */}
            <View style={styles.formGroup}>
              <Text style={styles.sectionLabel}>
                INCIDENT DESCRIPTION <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.textInputArea}
                placeholder="Describe current situation, injuries, trapped residents, or assistance needed..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
              />
              <Text style={styles.characterCount}>
                {description.length} / 2000 characters
              </Text>
            </View>

            {/* 4. LOCATION & LANDMARK */}
            <View style={styles.formGroup}>
              <Text style={styles.sectionLabel}>LOCATION & LANDMARK</Text>
              
              {/* GPS Button */}
              <TouchableOpacity
                style={styles.gpsButton}
                onPress={handleAcquireLocation}
                disabled={isLocating}
                activeOpacity={0.8}
              >
                {isLocating ? (
                  <ActivityIndicator size="small" color="#0F766E" />
                ) : (
                  <Text style={styles.gpsButtonText}>Pin Current GPS Coordinates</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.gpsStatusText}>{locationStatus}</Text>

              {/* Landmark quick select */}
              <Text style={[styles.sectionLabel, { marginTop: 12, marginBottom: 6 }]}>NEAREST MUNICIPAL FACILITY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.facilityScroll}>
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
                placeholder="Or type specific street, barangay, or landmark..."
                placeholderTextColor="#94A3B8"
                value={nearestBuilding}
                onChangeText={setNearestBuilding}
              />
            </View>

            {/* 5. CONTACT INFO (OPTIONAL) */}
            <View style={styles.formGroup}>
              <View style={styles.anonymousRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.sectionLabel}>ANONYMOUS REPORT</Text>
                  <Text style={styles.sublabel}>
                    {isAnonymous
                      ? 'Device ID attached for direct dispatch reply.'
                      : 'Attach name and phone for direct responder callback.'}
                  </Text>
                </View>
                <Switch
                  value={isAnonymous}
                  onValueChange={setIsAnonymous}
                  trackColor={{ false: '#CBD5E1', true: '#0F766E' }}
                  thumbColor={isAnonymous ? '#FFFFFF' : '#F1F5F9'}
                />
              </View>

              {!isAnonymous && (
                <View style={styles.contactFieldsBox}>
                  <Text style={styles.miniLabel}>FULL NAME</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Juan dela Cruz"
                    placeholderTextColor="#94A3B8"
                    value={reporterName}
                    onChangeText={setReporterName}
                  />

                  <Text style={[styles.miniLabel, { marginTop: 8 }]}>PHONE NUMBER</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 0912-345-6789"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    value={reporterPhone}
                    onChangeText={setReporterPhone}
                  />
                </View>
              )}
            </View>
          </ScrollView>

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
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>Send Emergency Report</Text>
              )}
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
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
    flex: 1,
  },
  bodyContent: {
    padding: 20,
  },
  assuranceBanner: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 14,
  },
  assuranceText: {
    color: '#166534',
    fontSize: 11.5,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 11.5,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  required: {
    color: '#DC2626',
  },
  sublabel: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
    lineHeight: 15,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  presetScroll: {
    gap: 8,
  },
  presetChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetChipText: {
    color: '#0F172A',
    fontSize: 11.5,
    fontWeight: '700',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBtn: {
    width: '31%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBtnLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
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
    paddingVertical: 10,
    alignItems: 'center',
  },
  severityButtonText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 11,
    color: '#0F172A',
    fontSize: 13,
    minHeight: 44,
  },
  textInputArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    color: '#0F172A',
    fontSize: 13,
    minHeight: 85,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'right',
    marginTop: 4,
  },
  gpsButton: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  gpsButtonText: {
    color: '#0F766E',
    fontWeight: '700',
    fontSize: 12,
  },
  gpsStatusText: {
    color: '#475569',
    fontSize: 11,
    marginTop: 4,
  },
  facilityScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  facilityChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  facilityChipActive: {
    borderColor: '#0F766E',
    backgroundColor: '#0F766E',
  },
  facilityChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  facilityChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  anonymousRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  contactFieldsBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
