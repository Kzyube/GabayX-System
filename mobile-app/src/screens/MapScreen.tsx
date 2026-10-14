import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import MapView, {
  Region,
  MapType,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  Marker,
  Polyline,
} from 'react-native-maps';
import * as Location from 'expo-location';
import {
  CAMPUS_CENTER,
  SAFE_ASSEMBLY_ZONES,
  CAMPUS_BUILDINGS,
  EVACUATION_ROUTES,
  CampusBuilding,
  SafeAssemblyZone,
  EvacuationRoute,
} from '../constants/geoData';

const INITIAL_REGION: Region = {
  latitude: CAMPUS_CENTER.latitude,
  longitude: CAMPUS_CENTER.longitude,
  latitudeDelta: 0.0035,
  longitudeDelta: 0.0035,
};

// Calculate Haversine distance in meters between two lat/lng points
function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export const MapScreen: React.FC = () => {
  const mapRef = useRef<MapView>(null);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [isSatellite, setIsSatellite] = useState(false);

  // Layer toggles
  const [showBuildings, setShowBuildings] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);

  // Selected place for bottom info card
  const [selectedPlace, setSelectedPlace] = useState<{
    type: 'building' | 'safe_zone' | 'route';
    title: string;
    subtitle: string;
    description: string;
    latitude?: number;
    longitude?: number;
    badge?: string;
  } | null>(null);

  // Live GPS tracking states
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Request location permission & watch position
  useEffect(() => {
    let subscriber: Location.LocationSubscription | null = null;

    async function initLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationPermission('denied');
          return;
        }

        setLocationPermission('granted');

        // Initial one-shot position
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (current && current.coords) {
          setUserCoords({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
          setGpsAccuracy(current.coords.accuracy ? Math.round(current.coords.accuracy) : null);
        }

        // Live position watcher
        subscriber = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 4,
          },
          (loc) => {
            if (loc && loc.coords) {
              setUserCoords({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              });
              setGpsAccuracy(loc.coords.accuracy ? Math.round(loc.coords.accuracy) : null);
            }
          }
        );
      } catch (err) {
        console.warn('Location initialization error:', err);
      }
    }

    initLocation();

    return () => {
      if (subscriber) {
        subscriber.remove();
      }
    };
  }, []);

  // Toggle map type between Standard and Satellite
  const toggleMapType = () => {
    const nextType: MapType = isSatellite ? 'standard' : 'satellite';
    setIsSatellite(!isSatellite);
    setMapType(nextType);
  };

  // Recenter map back to campus center coordinates
  const handleRecenterCampus = () => {
    mapRef.current?.animateToRegion(INITIAL_REGION, 600);
  };

  // Recenter map to user's real physical GPS location
  const handleRecenterUser = () => {
    if (!userCoords) {
      if (locationPermission === 'denied') {
        Alert.alert(
          'Location Permission Required',
          'Please enable location services in your phone settings to view your position on the campus evacuation map.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Acquiring GPS', 'Searching for satellite fix. Please ensure location is enabled.');
      }
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      },
      600
    );
  };

  // Calculate distance string from user to target coordinate
  const getDistanceFromUser = (targetLat?: number, targetLon?: number): string | null => {
    if (!userCoords || targetLat === undefined || targetLon === undefined) return null;
    const meters = calculateDistanceMeters(
      userCoords.latitude,
      userCoords.longitude,
      targetLat,
      targetLon
    );
    if (meters < 1000) {
      return `${meters}m away (~${Math.max(1, Math.round(meters / 80))} min walk)`;
    }
    return `${(meters / 1000).toFixed(1)}km away`;
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
        showsUserLocation={locationPermission === 'granted'}
        showsMyLocationButton={false}
      >
        {/* EVACUATION ROUTE POLYLINES */}
        {showRoutes &&
          EVACUATION_ROUTES.map((route: EvacuationRoute) => (
            <Polyline
              key={route.id}
              coordinates={route.coordinates}
              strokeColor={route.color}
              strokeWidth={4.5}
              lineCap="round"
              lineJoin="round"
              tappable={true}
              onPress={() => {
                setSelectedPlace({
                  type: 'route',
                  title: route.name,
                  subtitle: `Estimated Time: ~${route.estimatedMinutes} mins`,
                  description: route.description,
                  latitude: route.coordinates[0].latitude,
                  longitude: route.coordinates[0].longitude,
                  badge: 'ROUTE',
                });
              }}
            />
          ))}

        {/* SAFE ASSEMBLY ZONE MARKERS */}
        {showSafeZones &&
          SAFE_ASSEMBLY_ZONES.map((zone: SafeAssemblyZone) => (
            <Marker
              key={zone.id}
              coordinate={{ latitude: zone.latitude, longitude: zone.longitude }}
              title={zone.name}
              description={zone.description}
              onPress={() => {
                setSelectedPlace({
                  type: 'safe_zone',
                  title: zone.name,
                  subtitle: `Safe Assembly Area (${zone.capacity || 'Open Zone'})`,
                  description: zone.description,
                  latitude: zone.latitude,
                  longitude: zone.longitude,
                  badge: zone.shortLabel,
                });
              }}
            >
              <View style={[styles.zoneMarker, zone.isPrimaryHub && styles.primaryZoneMarker]}>
                <Text style={styles.zoneMarkerIcon}>{zone.isPrimaryHub ? '🛡️' : '⛳'}</Text>
                <Text style={styles.zoneMarkerText}>{zone.shortLabel}</Text>
              </View>
            </Marker>
          ))}

        {/* 19 CAMPUS BUILDING MARKERS */}
        {showBuildings &&
          CAMPUS_BUILDINGS.map((bldg: CampusBuilding) => (
            <Marker
              key={bldg.id}
              coordinate={{ latitude: bldg.latitude, longitude: bldg.longitude }}
              title={bldg.name}
              description={bldg.category}
              onPress={() => {
                setSelectedPlace({
                  type: 'building',
                  title: bldg.name,
                  subtitle: bldg.category,
                  description: `Campus designated building. Follow evacuation path to the nearest safe assembly zone.`,
                  latitude: bldg.latitude,
                  longitude: bldg.longitude,
                  badge: bldg.shortLetter,
                });
              }}
            >
              <View style={styles.bldgBadge}>
                <Text style={styles.bldgBadgeText}>{bldg.shortLetter}</Text>
              </View>
            </Marker>
          ))}
      </MapView>

      {/* TOP HEADER OVERLAYS */}
      <View style={styles.topOverlay}>
        {/* GPS STATUS PILL */}
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              locationPermission === 'granted' ? styles.statusDotGreen : styles.statusDotOrange,
            ]}
          />
          <Text style={styles.statusText}>
            {locationPermission === 'granted'
              ? `GPS LIVE${gpsAccuracy ? ` (±${gpsAccuracy}m)` : ''}`
              : 'GPS OFFLINE / FIXED'}
          </Text>
        </View>

        {/* LAYER TOGGLE BUTTONS */}
        <View style={styles.layerBar}>
          <TouchableOpacity
            style={[styles.layerChip, showBuildings && styles.layerChipActive]}
            onPress={() => setShowBuildings(!showBuildings)}
            activeOpacity={0.7}
          >
            <Text style={[styles.layerChipText, showBuildings && styles.layerChipTextActive]}>
              🏢 19 Bldgs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.layerChip, showSafeZones && styles.layerChipActive]}
            onPress={() => setShowSafeZones(!showSafeZones)}
            activeOpacity={0.7}
          >
            <Text style={[styles.layerChipText, showSafeZones && styles.layerChipTextActive]}>
              🛡️ 3 Hubs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.layerChip, showRoutes && styles.layerChipActive]}
            onPress={() => setShowRoutes(!showRoutes)}
            activeOpacity={0.7}
          >
            <Text style={[styles.layerChipText, showRoutes && styles.layerChipTextActive]}>
              🛣️ Routes
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BOTTOM SELECTED PLACE DETAIL CARD */}
      {selectedPlace && (
        <View style={styles.detailCardContainer}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleBox}>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>{selectedPlace.badge || 'INFO'}</Text>
                </View>
                <Text style={styles.detailTitle} numberOfLines={1}>
                  {selectedPlace.title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedPlace(null)}
                style={styles.closeBtn}
                accessibilityLabel="Close detail card"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.detailSubtitle}>{selectedPlace.subtitle}</Text>
            <Text style={styles.detailDesc}>{selectedPlace.description}</Text>

            {/* Distance from live GPS */}
            {selectedPlace.latitude && selectedPlace.longitude && (
              <View style={styles.distanceRow}>
                <Text style={styles.distanceLabel}>Distance from your location:</Text>
                <Text style={styles.distanceValue}>
                  {getDistanceFromUser(selectedPlace.latitude, selectedPlace.longitude) ||
                    'Enable GPS to calculate'}
                </Text>
              </View>
            )}

            {/* Focus Button */}
            {selectedPlace.latitude && selectedPlace.longitude && (
              <TouchableOpacity
                style={styles.focusBtn}
                onPress={() => {
                  mapRef.current?.animateToRegion(
                    {
                      latitude: selectedPlace.latitude!,
                      longitude: selectedPlace.longitude!,
                      latitudeDelta: 0.002,
                      longitudeDelta: 0.002,
                    },
                    500
                  );
                }}
              >
                <Text style={styles.focusBtnText}>🎯 Focus Location on Map</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* FLOATING MAP CONTROLS ON RIGHT */}
      <View style={styles.controlsGroup}>
        {/* RECENTER TO USER GPS */}
        <TouchableOpacity
          style={[styles.controlBtn, userCoords && styles.controlBtnActive]}
          onPress={handleRecenterUser}
          activeOpacity={0.8}
          accessibilityLabel="Center to user location"
        >
          <Text style={styles.controlIcon}>📍</Text>
          <Text style={styles.controlBtnText}>My GPS</Text>
        </TouchableOpacity>

        {/* RECENTER TO CAMPUS CENTER */}
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={handleRecenterCampus}
          activeOpacity={0.8}
          accessibilityLabel="Center to campus"
        >
          <Text style={styles.controlIcon}>🏫</Text>
          <Text style={styles.controlBtnText}>Campus</Text>
        </TouchableOpacity>

        {/* TOGGLE SATELLITE / STANDARD */}
        <TouchableOpacity
          style={[styles.controlBtn, isSatellite && styles.controlBtnActive]}
          onPress={toggleMapType}
          activeOpacity={0.8}
          accessibilityLabel="Toggle satellite view"
        >
          <Text style={styles.controlIcon}>{isSatellite ? '🗺️' : '🛰️'}</Text>
          <Text style={styles.controlBtnText}>{isSatellite ? 'Street' : 'Satellite'}</Text>
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
    left: 12,
    right: 12,
    gap: 8,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 23, 18, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotGreen: {
    backgroundColor: '#10b981',
  },
  statusDotOrange: {
    backgroundColor: '#f59e0b',
  },
  statusText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  layerBar: {
    flexDirection: 'row',
    gap: 6,
  },
  layerChip: {
    backgroundColor: 'rgba(12, 23, 18, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
  },
  layerChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#14b8a6',
  },
  layerChipText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  layerChipTextActive: {
    color: '#ffffff',
  },
  // MARKER STYLES
  bldgBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f59e0b',
    borderWidth: 2,
    borderColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  bldgBadgeText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '900',
  },
  zoneMarker: {
    backgroundColor: '#10b981',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  primaryZoneMarker: {
    backgroundColor: '#059669',
    borderColor: '#fef08a',
    borderWidth: 2,
  },
  zoneMarkerIcon: {
    fontSize: 12,
  },
  zoneMarkerText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  // CONTROLS GROUP
  controlsGroup: {
    position: 'absolute',
    right: 14,
    bottom: 24,
    gap: 8,
    alignItems: 'center',
  },
  controlBtn: {
    width: 54,
    height: 54,
    backgroundColor: 'rgba(12, 23, 18, 0.94)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  controlBtnActive: {
    backgroundColor: 'rgba(15, 118, 110, 0.85)',
    borderColor: '#14b8a6',
  },
  controlIcon: {
    fontSize: 18,
  },
  controlBtnText: {
    color: '#f1f5f9',
    fontSize: 8.5,
    fontWeight: '700',
    marginTop: 1,
  },
  // BOTTOM DETAIL CARD
  detailCardContainer: {
    position: 'absolute',
    left: 14,
    right: 76,
    bottom: 24,
  },
  detailCard: {
    backgroundColor: 'rgba(12, 23, 18, 0.96)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  badgePill: {
    backgroundColor: '#0f766e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePillText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  detailTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  detailSubtitle: {
    color: '#38bdf8',
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailDesc: {
    color: '#cbd5e1',
    fontSize: 9.5,
    lineHeight: 13,
    marginBottom: 8,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  distanceLabel: {
    color: '#94a3b8',
    fontSize: 8.5,
    fontWeight: '600',
  },
  distanceValue: {
    color: '#34d399',
    fontSize: 9.5,
    fontWeight: '800',
  },
  focusBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  focusBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
});
