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

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: CreateReportInput) => Promise<void>;
}

const CATEGORIES: { label: string; value: ReportCategory; icon: string }[] = [
  { label: 'Earthquake', value: 'EARTHQUAKE', icon: '🏚️' },
  { label: 'Fire', value: 'FIRE', icon: '🔥' },
  { label: 'Flood', value: 'FLOOD', icon: '🌊' },
  { label: 'Medical Emergency', value: 'MEDICAL', icon: '🚑' },
  { label: 'Trapped / Debris', value: 'TRAPPED', icon: '🆘' },
  { label: 'Hazard / Danger', value: 'HAZARD', icon: '⚠️' },
  { label: 'General Assistance', value: 'GENERAL', icon: '📢' },
];

const SEVERITIES: { label: string; value: ReportSeverity }[] = [
  { label: 'Critical', value: 'CRITICAL' },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

export const CreateReportModal: React.FC<Props> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const [category, setCategory] = useState<ReportCategory>('EARTHQUAKE');
  const [severity, setSeverity] = useState<ReportSeverity>('HIGH');
  const [description, setDescription] = useState('');
  const [nearestBuilding, setNearestBuilding] = useState('Campus Zone');
  
  // Location
  const [isLocating, setIsLocating] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('Location not acquired');

  // Contact Info
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setCategory('EARTHQUAKE');
    setSeverity('HIGH');
    setDescription('');
    setNearestBuilding('Campus Zone');
    setLatitude(null);
    setLongitude(null);
    setAccuracy(null);
    setLocationStatus('Location not acquired');
    setIsAnonymous(true);
    setReporterName('');
    setReporterPhone('');
    setErrorMessage(null);
  };

  const handleAcquireLocation = async () => {
    setIsLocating(true);
    setLocationStatus('Requesting GPS permission...');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('GPS permission denied (optional)');
        setIsLocating(false);
        return;
      }

      setLocationStatus('Acquiring hardware GPS fix...');
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
      console.warn('[Location] Failed to acquire GPS position:', err);
      setLocationStatus('GPS unavailable (report will save without coordinates)');
    } finally {
      setIsLocating(false);
    }
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

    // Client-side validation
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
              <Text style={styles.headerSubtitle}>NEW INCIDENT REPORT</Text>
              <Text style={styles.headerTitle}>File Emergency Report</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                onClose();
              }}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* OFFLINE NOTICE BANNER */}
            <View style={styles.warningBanner}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.warningText}>
                NOTICE: This report will be saved to your device's local database with status PENDING.
                Because you are offline, it has NOT reached emergency responders yet until synced via
                Bluetooth mesh or internet.
              </Text>
            </View>

            {/* ERROR DISPLAY */}
            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>❌ {errorMessage}</Text>
              </View>
            )}

            {/* 1. INCIDENT CATEGORY */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                INCIDENT CATEGORY <Text style={styles.required}>*</Text>
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}
              >
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat.value;
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      style={[
                        styles.categoryCard,
                        isSelected && styles.categoryCardSelected,
                      ]}
                      onPress={() => setCategory(cat.value)}
                    >
                      <Text style={styles.categoryIcon}>{cat.icon}</Text>
                      <Text
                        style={[
                          styles.categoryLabel,
                          isSelected && styles.categoryLabelSelected,
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* 2. SEVERITY */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>SEVERITY LEVEL</Text>
              <View style={styles.severityRow}>
                {SEVERITIES.map((sev) => {
                  const isSelected = severity === sev.value;
                  return (
                    <TouchableOpacity
                      key={sev.value}
                      style={[
                        styles.severityButton,
                        isSelected && styles.severityButtonSelected,
                      ]}
                      onPress={() => setSeverity(sev.value)}
                    >
                      <Text
                        style={[
                          styles.severityButtonText,
                          isSelected && styles.severityButtonTextSelected,
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
              <Text style={styles.label}>
                INCIDENT DESCRIPTION <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.textInputArea}
                placeholder="Describe what happened, injuries, hazards, or immediate assistance needed..."
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

            {/* 4. LOCATION & PROXIMITY */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>LOCATION & PROXIMITY</Text>
              <View style={styles.locationContainer}>
                <TouchableOpacity
                  style={styles.locationBtn}
                  onPress={handleAcquireLocation}
                  disabled={isLocating}
                >
                  {isLocating ? (
                    <ActivityIndicator size="small" color="#10b981" />
                  ) : (
                    <Text style={styles.locationBtnText}>📍 Acquire Current GPS Coordinates</Text>
                  )}
                </TouchableOpacity>
                <Text style={styles.locationStatusText}>{locationStatus}</Text>
              </View>

              <Text style={[styles.label, { marginTop: 10 }]}>CAMPUS ZONE / REFERENCE</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. BLDG A, Main Quad, Mendoza Court"
                placeholderTextColor="#64748b"
                value={nearestBuilding}
                onChangeText={setNearestBuilding}
              />
            </View>

            {/* 5. OPTIONAL CONTACT INFORMATION */}
            <View style={styles.formGroup}>
              <View style={styles.anonymousRow}>
                <View>
                  <Text style={styles.label}>SUBMIT ANONYMOUSLY</Text>
                  <Text style={styles.sublabel}>
                    {isAnonymous
                      ? 'No personal details attached'
                      : 'Attach name/phone for emergency responders'}
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
                  <Text style={styles.label}>FULL NAME</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Juan dela Cruz"
                    placeholderTextColor="#64748b"
                    value={reporterName}
                    onChangeText={setReporterName}
                  />

                  <Text style={[styles.label, { marginTop: 8 }]}>CONTACT NUMBER</Text>
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

          {/* FOOTER */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                resetForm();
                onClose();
              }}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#060d09" />
              ) : (
                <Text style={styles.submitBtnText}>Save Report Locally</Text>
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
    backgroundColor: '#0c1712',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '92%',
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
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 10,
  },
  warningIcon: {
    fontSize: 18,
  },
  warningText: {
    flex: 1,
    color: '#fef3c7',
    fontSize: 11,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 11.5,
    fontWeight: '600',
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  sublabel: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 2,
  },
  required: {
    color: '#ef4444',
  },
  categoryScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  categoryCard: {
    backgroundColor: '#060d09',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    minWidth: 90,
  },
  categoryCardSelected: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  categoryIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 10.5,
    color: '#94a3b8',
    fontWeight: '700',
  },
  categoryLabelSelected: {
    color: '#10b981',
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    backgroundColor: '#060d09',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  severityButtonSelected: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  severityButtonText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  severityButtonTextSelected: {
    color: '#10b981',
  },
  textInput: {
    backgroundColor: '#060d09',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#f1f5f9',
    fontSize: 13,
  },
  textInputArea: {
    backgroundColor: '#060d09',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#f1f5f9',
    fontSize: 13,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 9.5,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 2,
  },
  locationContainer: {
    backgroundColor: '#060d09',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  locationBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  locationBtnText: {
    color: '#10b981',
    fontWeight: '700',
    fontSize: 11.5,
  },
  locationStatusText: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  anonymousRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#060d09',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  contactFieldsBox: {
    marginTop: 8,
    backgroundColor: '#060d09',
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
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontWeight: '700',
    fontSize: 12,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#10b981',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#060d09',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
