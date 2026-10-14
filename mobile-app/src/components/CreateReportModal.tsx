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

const CATEGORIES: { label: string; value: ReportCategory; icon: string; color: string }[] = [
  { label: 'Medical', value: 'MEDICAL', icon: '🚑', color: '#ef4444' },
  { label: 'Fire', value: 'FIRE', icon: '🔥', color: '#f97316' },
  { label: 'Flood', value: 'FLOOD', icon: '🌊', color: '#0284c7' },
  { label: 'Earthquake', value: 'EARTHQUAKE', icon: '🏚️', color: '#d97706' },
  { label: 'Trapped', value: 'TRAPPED', icon: '🆘', color: '#dc2626' },
  { label: 'Hazard', value: 'HAZARD', icon: '⚠️', color: '#eab308' },
];

const SEVERITIES: { label: string; value: ReportSeverity; color: string }[] = [
  { label: 'Critical', value: 'CRITICAL', color: '#ef4444' },
  { label: 'High', value: 'HIGH', color: '#f97316' },
  { label: 'Medium', value: 'MEDIUM', color: '#eab308' },
  { label: 'Low', value: 'LOW', color: '#10b981' },
];

const QUICK_PRESETS = [
  {
    icon: '🚑',
    title: 'Medical Triage',
    category: 'MEDICAL' as ReportCategory,
    severity: 'CRITICAL' as ReportSeverity,
    text: 'Injured resident requiring emergency ambulance and paramedic assistance.',
  },
  {
    icon: '🔥',
    title: 'Structure Fire',
    category: 'FIRE' as ReportCategory,
    severity: 'HIGH' as ReportSeverity,
    text: 'Active structure fire spreading rapidly. Evacuation in progress.',
  },
  {
    icon: '🌊',
    title: 'Flood Rescue',
    category: 'FLOOD' as ReportCategory,
    severity: 'HIGH' as ReportSeverity,
    text: 'Rising flood waters trapped residents. Need evacuation transport.',
  },
  {
    icon: '🏚️',
    title: 'Collapsed Wall',
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
    setLocationStatus('Requesting GPS lock...');
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
        `📍 ${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)} (±${Math.round(location.coords.accuracy || 0)}m)`
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
              <Text style={styles.headerTitle}>🚨 Report Emergency Incident</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                onClose();
              }}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* STATUS ASSURANCE BANNER */}
            <View style={styles.assuranceBanner}>
              <Text style={styles.assuranceIcon}>🛡️</Text>
              <Text style={styles.assuranceText}>
                Offline-Ready: Saved permanently on device and auto-dispatched to MDRRMO Central Command.
              </Text>
            </View>

            {/* ERROR DISPLAY */}
            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
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
                    <Text style={styles.presetChipIcon}>{preset.icon}</Text>
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
                        isSelected && { borderColor: cat.color, backgroundColor: `${cat.color}15` },
                      ]}
                      onPress={() => setCategory(cat.value)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.categoryBtnIcon}>{cat.icon}</Text>
                      <Text
                        style={[
                          styles.categoryBtnLabel,
                          isSelected && { color: '#ffffff', fontWeight: '800' },
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
                        isSelected && { borderColor: sev.color, backgroundColor: `${sev.color}25` },
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
                placeholderTextColor="#64748b"
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
                  <ActivityIndicator size="small" color="#10b981" />
                ) : (
                  <Text style={styles.gpsButtonText}>📍 Pin Hardware GPS Coordinates</Text>
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
                placeholderTextColor="#64748b"
                value={nearestBuilding}
                onChangeText={setNearestBuilding}
              />
            </View>

            {/* 5. CONTACT INFO (OPTIONAL) */}
            <View style={styles.formGroup}>
              <View style={styles.anonymousRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionLabel}>ANONYMOUS REPORT</Text>
                  <Text style={styles.sublabel}>
                    {isAnonymous
                      ? 'Protected: Only device ID attached for dispatch reply'
                      : 'Attach name and phone for direct responder callback'}
                  </Text>
                </View>
                <Switch
                  value={isAnonymous}
                  onValueChange={setIsAnonymous}
                  trackColor={{ false: '#334155', true: '#059669' }}
                  thumbColor={isAnonymous ? '#10b981' : '#94a3b8'}
                />
              </View>

              {!isAnonymous && (
                <View style={styles.contactFieldsBox}>
                  <Text style={styles.miniLabel}>FULL NAME</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Juan dela Cruz"
                    placeholderTextColor="#64748b"
                    value={reporterName}
                    onChangeText={setReporterName}
                  />

                  <Text style={[styles.miniLabel, { marginTop: 8 }]}>PHONE NUMBER</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 0912-345-6789"
                    placeholderTextColor="#64748b"
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
                <Text style={styles.submitBtnText}>🚨 SEND TO MDRRMO</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '92%',
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 18,
    gap: 16,
  },
  assuranceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.3)',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  assuranceIcon: {
    fontSize: 16,
  },
  assuranceText: {
    flex: 1,
    fontSize: 11.5,
    color: '#a7f3d0',
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    padding: 10,
    borderRadius: 8,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '600',
  },
  formGroup: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  sublabel: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 2,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  required: {
    color: '#ef4444',
  },
  presetScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  presetChipIcon: {
    fontSize: 13,
  },
  presetChipText: {
    fontSize: 11.5,
    color: '#e2e8f0',
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBtn: {
    width: '31%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  categoryBtnIcon: {
    fontSize: 22,
  },
  categoryBtnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  severityButtonText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    padding: 11,
    color: '#f8fafc',
    fontSize: 13,
  },
  textInputArea: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 13,
    minHeight: 85,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 9.5,
    color: '#64748b',
    textAlign: 'right',
  },
  gpsButton: {
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  gpsButtonText: {
    color: '#10b981',
    fontWeight: '700',
    fontSize: 12,
  },
  gpsStatusText: {
    color: '#94a3b8',
    fontSize: 10.5,
    fontFamily: 'monospace',
    marginTop: 3,
  },
  facilityScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  facilityChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  facilityChipActive: {
    borderColor: '#059669',
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
  },
  facilityChipText: {
    fontSize: 10.5,
    color: '#94a3b8',
    fontWeight: '600',
  },
  facilityChipTextActive: {
    color: '#34d399',
    fontWeight: '700',
  },
  anonymousRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  contactFieldsBox: {
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 4,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 12,
    backgroundColor: '#0f172a',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontWeight: '700',
    fontSize: 13,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
