import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import MapView, {
  Region,
  MapType,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

/**
 * GabayX Campus Center Coordinates
 * Matches PWA student.html EVACUATION_CENTER_COORDS / Principal Front
 */
const CAMPUS_CENTER = {
  latitude: 7.100589893149529,
  longitude: 124.82393056927546,
};

const INITIAL_REGION: Region = {
  latitude: CAMPUS_CENTER.latitude,
  longitude: CAMPUS_CENTER.longitude,
  latitudeDelta: 0.003,
  longitudeDelta: 0.003,
};

export const MapScreen: React.FC = () => {
  const mapRef = useRef<MapView>(null);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [isSatellite, setIsSatellite] = useState(false);

  // Toggle between standard and satellite view
  const toggleMapType = () => {
    const nextType: MapType = isSatellite ? 'standard' : 'satellite';
    setIsSatellite(!isSatellite);
    setMapType(nextType);
  };

  // Recenter map back to campus center coordinates
  const handleRecenter = () => {
    mapRef.current?.animateToRegion(INITIAL_REGION, 600);
  };

  return (
    <View style={styles.container}>
      {/* NATIVE MAP COMPONENT */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={INITIAL_REGION}
        mapType={mapType}
        zoomEnabled={true}
        scrollEnabled={true}
        rotateEnabled={true}
        pitchEnabled={false}
        showsCompass={true}
      />

      {/* TOP STATUS & COORDINATE OVERLAY */}
      <View style={styles.topOverlay}>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Campus Center Locked</Text>
        </View>

        <View style={styles.coordBox}>
          <Text style={styles.coordLabel}>PWA Reference Coords:</Text>
          <Text style={styles.coordValue}>
            {CAMPUS_CENTER.latitude.toFixed(6)}° N, {CAMPUS_CENTER.longitude.toFixed(6)}° E
          </Text>
        </View>
      </View>

      {/* SETUP & OFFLINE REALITY DISCLAIMER BANNER */}
      <View style={styles.disclaimerContainer}>
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerIcon}>ℹ️</Text>
          <View style={styles.disclaimerContent}>
            <Text style={styles.disclaimerTitle}>Step 2 Map Scaffold</Text>
            <Text style={styles.disclaimerSubtitle}>
              Pan & zoom active. Google Maps API key required for live tiles on Android. Offline geographic data & routes will be added in subsequent steps.
            </Text>
          </View>
        </View>
      </View>

      {/* FLOATING MAP CONTROLS */}
      <View style={styles.controlsGroup}>
        {/* MAP TYPE TOGGLE (STANDARD / SATELLITE) */}
        <TouchableOpacity
          style={[styles.controlBtn, isSatellite && styles.controlBtnActive]}
          onPress={toggleMapType}
          activeOpacity={0.8}
          accessibilityLabel="Toggle satellite view"
        >
          <Text style={styles.controlIcon}>{isSatellite ? '🗺️' : '🛰️'}</Text>
          <Text style={styles.controlBtnText}>{isSatellite ? 'Street' : 'Satellite'}</Text>
        </TouchableOpacity>

        {/* RECENTER BUTTON */}
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={handleRecenter}
          activeOpacity={0.8}
          accessibilityLabel="Recenter map to campus center"
        >
          <Text style={styles.controlIcon}>🎯</Text>
          <Text style={styles.controlBtnText}>Center</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060d09',
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topOverlay: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 23, 18, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  statusText: {
    color: '#10b981',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  coordBox: {
    backgroundColor: 'rgba(12, 23, 18, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  coordLabel: {
    color: '#94a3b8',
    fontSize: 8.5,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  coordValue: {
    color: '#f1f5f9',
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  disclaimerContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 88, // leave space for right floating buttons
  },
  disclaimerCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(12, 23, 18, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 8,
  },
  disclaimerIcon: {
    fontSize: 14,
  },
  disclaimerContent: {
    flex: 1,
  },
  disclaimerTitle: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '800',
  },
  disclaimerSubtitle: {
    color: '#cbd5e1',
    fontSize: 9.5,
    lineHeight: 13,
    marginTop: 2,
  },
  controlsGroup: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    gap: 10,
    alignItems: 'center',
  },
  controlBtn: {
    width: 60,
    height: 60,
    backgroundColor: '#0c1712',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  controlBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
  },
  controlIcon: {
    fontSize: 20,
  },
  controlBtnText: {
    color: '#f1f5f9',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
});
