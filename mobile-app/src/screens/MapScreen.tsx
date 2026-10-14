import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import {
  CAMPUS_CENTER,
  SAFE_ASSEMBLY_ZONES,
  CAMPUS_BUILDINGS,
  EVACUATION_ROUTES,
} from '../constants/geoData';

// Calculate Haversine distance in meters
function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
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
  const webViewRef = useRef<WebView>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

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

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (current && current.coords) {
          const coords = {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          };
          setUserCoords(coords);
          setGpsAccuracy(current.coords.accuracy ? Math.round(current.coords.accuracy) : null);
          postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords });
        }

        subscriber = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 4,
          },
          (loc) => {
            if (loc && loc.coords) {
              const coords = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              };
              setUserCoords(coords);
              setGpsAccuracy(loc.coords.accuracy ? Math.round(loc.coords.accuracy) : null);
              postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords });
            }
          }
        );
      } catch (err) {
        console.warn('Location initialization error:', err);
      }
    }

    initLocation();

    return () => {
      if (subscriber) subscriber.remove();
    };
  }, []);

  const postMessageToWeb = (msg: object) => {
    const js = `window.handleNativeMessage && window.handleNativeMessage(${JSON.stringify(msg)}); true;`;
    webViewRef.current?.injectJavaScript(js);
  };

  // Toggle map type between Street (OSM) and Satellite (ArcGIS)
  const toggleMapType = () => {
    const next = !isSatellite;
    setIsSatellite(next);
    postMessageToWeb({ type: 'SET_MAP_TYPE', mode: next ? 'satellite' : 'standard' });
  };

  const handleRecenterCampus = () => {
    postMessageToWeb({ type: 'RECENTER_CAMPUS' });
  };

  const handleRecenterUser = () => {
    if (!userCoords) {
      if (locationPermission === 'denied') {
        Alert.alert(
          'Location Permission Required',
          'Please enable location services in your phone settings to view your position on the map.'
        );
      } else {
        Alert.alert('Acquiring GPS', 'Searching for satellite fix. Please ensure location is enabled.');
      }
      return;
    }
    postMessageToWeb({ type: 'RECENTER_USER', coords: userCoords });
  };

  const toggleLayer = (layer: 'buildings' | 'safeZones' | 'routes') => {
    if (layer === 'buildings') {
      const next = !showBuildings;
      setShowBuildings(next);
      postMessageToWeb({ type: 'TOGGLE_LAYER', layer: 'buildings', visible: next });
    } else if (layer === 'safeZones') {
      const next = !showSafeZones;
      setShowSafeZones(next);
      postMessageToWeb({ type: 'TOGGLE_LAYER', layer: 'safeZones', visible: next });
    } else if (layer === 'routes') {
      const next = !showRoutes;
      setShowRoutes(next);
      postMessageToWeb({ type: 'TOGGLE_LAYER', layer: 'routes', visible: next });
    }
  };

  const handleWebMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_READY') {
        setMapLoaded(true);
        if (userCoords) {
          postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords: userCoords });
        }
      } else if (data.type === 'SELECT_PLACE') {
        setSelectedPlace(data.place);
      }
    } catch (e) {
      console.warn('Error parsing web message:', e);
    }
  };

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

  // Generate self-contained Leaflet HTML with OpenStreetMap and Satellite layers
  const leafletHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #060d09; }
    .bldg-marker {
      width: 24px; height: 24px; border-radius: 12px; background: #f59e0b;
      border: 2px solid #0f172a; color: #0f172a; font-weight: 900; font-size: 11px;
      display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .hub-marker {
      background: #10b981; border: 2px solid #ffffff; border-radius: 14px;
      padding: 3px 6px; color: #ffffff; font-weight: 800; font-size: 10px;
      display: flex; align-items: center; gap: 4px; box-shadow: 0 3px 8px rgba(0,0,0,0.5);
      white-space: nowrap;
    }
    .hub-primary { background: #059669; border-color: #fef08a; }
    .user-pulse {
      width: 18px; height: 18px; border-radius: 50%; background: #0284c7;
      border: 3px solid #ffffff; box-shadow: 0 0 12px #38bdf8;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const CAMPUS = [${CAMPUS_CENTER.latitude}, ${CAMPUS_CENTER.longitude}];
    const map = L.map('map', { zoomControl: false }).setView(CAMPUS, 18);

    const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });

    let userMarker = null;
    let bldgLayer = L.layerGroup().addTo(map);
    let zoneLayer = L.layerGroup().addTo(map);
    let routeLayer = L.layerGroup().addTo(map);

    const BUILDINGS = ${JSON.stringify(CAMPUS_BUILDINGS)};
    const SAFE_ZONES = ${JSON.stringify(SAFE_ASSEMBLY_ZONES)};
    const ROUTES = ${JSON.stringify(EVACUATION_ROUTES)};

    // Render 19 Campus Buildings
    BUILDINGS.forEach(b => {
      const icon = L.divIcon({ className: '', html: '<div class="bldg-marker">' + b.shortLetter + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
      const m = L.marker([b.latitude, b.longitude], { icon: icon });
      m.on('click', () => {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SELECT_PLACE',
          place: {
            type: 'building',
            title: b.name,
            subtitle: b.category,
            description: 'Campus designated academic building. Follow marked evacuation path.',
            latitude: b.latitude,
            longitude: b.longitude,
            badge: b.shortLetter
          }
        }));
      });
      bldgLayer.addLayer(m);
    });

    // Render 3 Safe Assembly Hubs
    SAFE_ZONES.forEach(z => {
      const isPrimary = z.isPrimaryHub;
      const icon = L.divIcon({
        className: '',
        html: '<div class="hub-marker ' + (isPrimary ? 'hub-primary' : '') + '">' + (isPrimary ? '🛡️' : '⛳') + ' ' + z.shortLabel + '</div>',
        iconSize: [60, 24], iconAnchor: [30, 12]
      });
      const m = L.marker([z.latitude, z.longitude], { icon: icon });
      m.on('click', () => {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SELECT_PLACE',
          place: {
            type: 'safe_zone',
            title: z.name,
            subtitle: 'Safe Assembly Area (' + (z.capacity || 'Open Hub') + ')',
            description: z.description,
            latitude: z.latitude,
            longitude: z.longitude,
            badge: z.shortLabel
          }
        }));
      });
      zoneLayer.addLayer(m);
    });

    // Render 3 Evacuation Routes
    ROUTES.forEach(r => {
      const pts = r.coordinates.map(c => [c.latitude, c.longitude]);
      const poly = L.polyline(pts, { color: r.color, weight: 5, opacity: 0.9, lineCap: 'round' });
      poly.on('click', () => {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SELECT_PLACE',
          place: {
            type: 'route',
            title: r.name,
            subtitle: 'Estimated Time: ~' + r.estimatedMinutes + ' mins',
            description: r.description,
            latitude: r.coordinates[0].latitude,
            longitude: r.coordinates[0].longitude,
            badge: 'ROUTE'
          }
        }));
      });
      routeLayer.addLayer(poly);
    });

    // Native Message Bridge Handler
    window.handleNativeMessage = function(data) {
      if (data.type === 'SET_MAP_TYPE') {
        if (data.mode === 'satellite') {
          map.removeLayer(osmLayer);
          map.addLayer(satLayer);
        } else {
          map.removeLayer(satLayer);
          map.addLayer(osmLayer);
        }
      } else if (data.type === 'RECENTER_CAMPUS') {
        map.setView(CAMPUS, 18, { animate: true });
      } else if (data.type === 'RECENTER_USER' && data.coords) {
        map.setView([data.coords.latitude, data.coords.longitude], 18, { animate: true });
      } else if (data.type === 'UPDATE_USER_LOCATION' && data.coords) {
        const userPos = [data.coords.latitude, data.coords.longitude];
        if (!userMarker) {
          const userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
          userMarker = L.marker(userPos, { icon: userIcon }).addTo(map);
        } else {
          userMarker.setLatLng(userPos);
        }
      } else if (data.type === 'TOGGLE_LAYER') {
        if (data.layer === 'buildings') data.visible ? map.addLayer(bldgLayer) : map.removeLayer(bldgLayer);
        if (data.layer === 'safeZones') data.visible ? map.addLayer(zoneLayer) : map.removeLayer(zoneLayer);
        if (data.layer === 'routes') data.visible ? map.addLayer(routeLayer) : map.removeLayer(routeLayer);
      }
    };

    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
  </script>
</body>
</html>
`;

  return (
    <View style={styles.container}>
      {/* WEBVIEW-POWERED MAP ENGINE (NO API KEY REQUIRED, WORKS INSTANTLY ON ALL PHONES) */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: leafletHtml }}
        style={styles.map}
        onMessage={handleWebMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.loadingText}>Loading Campus Map & Routes...</Text>
          </View>
        )}
      />

      {/* TOP STATUS OVERLAY */}
      <View style={styles.topOverlay}>
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
            onPress={() => toggleLayer('buildings')}
            activeOpacity={0.7}
          >
            <Text style={[styles.layerChipText, showBuildings && styles.layerChipTextActive]}>
              🏢 19 Bldgs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.layerChip, showSafeZones && styles.layerChipActive]}
            onPress={() => toggleLayer('safeZones')}
            activeOpacity={0.7}
          >
            <Text style={[styles.layerChipText, showSafeZones && styles.layerChipTextActive]}>
              🛡️ 3 Hubs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.layerChip, showRoutes && styles.layerChipActive]}
            onPress={() => toggleLayer('routes')}
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
                  postMessageToWeb({
                    type: 'RECENTER_USER',
                    coords: {
                      latitude: selectedPlace.latitude!,
                      longitude: selectedPlace.longitude!,
                    },
                  });
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

        {/* TOGGLE SATELLITE / STREET */}
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
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#060d09',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
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
    backgroundColor: 'rgba(12, 23, 18, 0.9)',
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
