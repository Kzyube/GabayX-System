import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  SafeAssemblyZone,
  LatLng,
} from '../constants/geoData';

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

export interface ActiveEvacRoute {
  originTitle: string;
  originCoords: LatLng;
  targetZone: SafeAssemblyZone;
  distanceMeters: number;
  walkMinutes: number;
  waypoints: [number, number][];
}

export interface MapScreenProps {
  initialAutoRoute?: boolean;
  onClearAutoRoute?: () => void;
  activeDisaster?: { type: string; message: string } | null;
}

export const MapScreen: React.FC<MapScreenProps> = ({
  initialAutoRoute = false,
  onClearAutoRoute,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Layer toggles
  const [showBuildings, setShowBuildings] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);

  // Active Evacuation Route
  const [activeEvacRoute, setActiveEvacRoute] = useState<ActiveEvacRoute | null>(null);

  // Selected place for bottom sheet
  const [selectedPlace, setSelectedPlace] = useState<{
    type: 'building' | 'safe_zone';
    title: string;
    subtitle: string;
    description: string;
    latitude?: number;
    longitude?: number;
    badge?: string;
  } | null>(null);

  // Live GPS tracking
  const [userCoords, setUserCoords] = useState<LatLng | null>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'pending'>('pending');

  const postMessageToWeb = useCallback((msg: object) => {
    const js = `window.handleNativeMessage && window.handleNativeMessage(${JSON.stringify(msg)}); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, []);

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
          postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords });
        }

        subscriber = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 5,
          },
          (loc) => {
            if (loc && loc.coords) {
              const coords = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              };
              setUserCoords(coords);
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
  }, [postMessageToWeb]);

  const startEvacuationRoute = useCallback(
    (origin: LatLng, originName: string, requestedHub?: SafeAssemblyZone) => {
      let targetHub = requestedHub;
      if (!targetHub) {
        let minDistance = Infinity;
        let closest = SAFE_ASSEMBLY_ZONES[0];

        SAFE_ASSEMBLY_ZONES.forEach((zone) => {
          const dist = calculateDistanceMeters(
            origin.latitude,
            origin.longitude,
            zone.latitude,
            zone.longitude
          );
          if (dist < minDistance) {
            minDistance = dist;
            closest = zone;
          }
        });
        targetHub = closest;
      }

      const quadrangleConnector: [number, number] = [7.10030, 124.82400];
      const startPoint: [number, number] = [origin.latitude, origin.longitude];
      const endPoint: [number, number] = [targetHub.latitude, targetHub.longitude];

      const directDist = calculateDistanceMeters(
        origin.latitude,
        origin.longitude,
        targetHub.latitude,
        targetHub.longitude
      );

      let waypoints: [number, number][] = [startPoint, endPoint];
      if (directDist > 50) {
        waypoints = [startPoint, quadrangleConnector, endPoint];
      }

      const totalMeters = Math.max(25, directDist);
      const estMinutes = Math.max(1, Math.ceil(totalMeters / 75));

      const routeData: ActiveEvacRoute = {
        originTitle: originName,
        originCoords: origin,
        targetZone: targetHub,
        distanceMeters: totalMeters,
        walkMinutes: estMinutes,
        waypoints,
      };

      setActiveEvacRoute(routeData);
      setSelectedPlace(null);

      postMessageToWeb({
        type: 'SHOW_EVACUATION_ROUTE',
        origin: { latitude: origin.latitude, longitude: origin.longitude },
        destination: { latitude: targetHub.latitude, longitude: targetHub.longitude },
        waypoints,
        hubName: targetHub.name,
        hubBadge: targetHub.shortLabel,
      });
    },
    [postMessageToWeb]
  );

  const handleTriggerEvacuate = useCallback(() => {
    let origin = CAMPUS_CENTER;
    let title = 'Campus Grounds';

    if (userCoords) {
      const distFromCampus = calculateDistanceMeters(
        userCoords.latitude,
        userCoords.longitude,
        CAMPUS_CENTER.latitude,
        CAMPUS_CENTER.longitude
      );
      if (distFromCampus < 2500) {
        origin = userCoords;
        title = 'Your Location';
      } else {
        origin = { latitude: CAMPUS_BUILDINGS[0].latitude, longitude: CAMPUS_BUILDINGS[0].longitude };
        title = `${CAMPUS_BUILDINGS[0].name}`;
      }
    } else {
      origin = { latitude: CAMPUS_BUILDINGS[0].latitude, longitude: CAMPUS_BUILDINGS[0].longitude };
      title = `${CAMPUS_BUILDINGS[0].name}`;
    }

    startEvacuationRoute(origin, title);
  }, [userCoords, startEvacuationRoute]);

  const handleClearRoute = () => {
    setActiveEvacRoute(null);
    postMessageToWeb({ type: 'CLEAR_EVACUATION_ROUTE' });
  };

  useEffect(() => {
    if (initialAutoRoute && mapLoaded) {
      handleTriggerEvacuate();
      if (onClearAutoRoute) {
        onClearAutoRoute();
      }
    }
  }, [initialAutoRoute, mapLoaded, handleTriggerEvacuate, onClearAutoRoute]);

  const toggleMapType = () => {
    const next = !isSatellite;
    setIsSatellite(next);
    postMessageToWeb({ type: 'SET_MAP_TYPE', mode: next ? 'satellite' : 'standard' });
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

  const handleRecenterCampus = () => {
    postMessageToWeb({ type: 'RECENTER_CAMPUS' });
  };

  const handleRecenterUser = () => {
    if (!userCoords) {
      if (locationPermission === 'denied') {
        Alert.alert('Location Disabled', 'Please enable location in phone settings to see your position.');
      } else {
        Alert.alert('Acquiring GPS', 'Looking for GPS fix. Centering on campus grounds.');
        handleRecenterCampus();
      }
      return;
    }
    postMessageToWeb({ type: 'RECENTER_USER', coords: userCoords });
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
      return `${meters}m away`;
    }
    return `${(meters / 1000).toFixed(1)}km away`;
  };

  const leafletHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f8fafc; }
    .bldg-marker {
      width: 22px; height: 22px; border-radius: 11px; background: #0f172a;
      border: 2px solid #ffffff; color: #ffffff; font-weight: 800; font-size: 11px;
      display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .hub-marker {
      background: #059669; border: 2px solid #ffffff; border-radius: 14px;
      padding: 3px 8px; color: #ffffff; font-weight: 800; font-size: 11px;
      display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      white-space: nowrap;
    }
    .user-pulse {
      width: 16px; height: 16px; border-radius: 50%; background: #2563eb;
      border: 3px solid #ffffff; box-shadow: 0 0 8px rgba(37,99,235,0.7);
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
    let dynamicRouteGroup = L.layerGroup().addTo(map);

    const BUILDINGS = ${JSON.stringify(CAMPUS_BUILDINGS)};
    const SAFE_ZONES = ${JSON.stringify(SAFE_ASSEMBLY_ZONES)};

    BUILDINGS.forEach(b => {
      const icon = L.divIcon({ className: '', html: '<div class="bldg-marker">' + b.shortLetter + '</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
      const m = L.marker([b.latitude, b.longitude], { icon: icon });
      m.on('click', () => {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SELECT_PLACE',
          place: {
            type: 'building',
            title: b.name,
            subtitle: b.category,
            description: 'Campus facility. Tap Evacuate to see path to nearest safe hub.',
            latitude: b.latitude,
            longitude: b.longitude,
            badge: b.shortLetter
          }
        }));
      });
      bldgLayer.addLayer(m);
    });

    SAFE_ZONES.forEach(z => {
      const icon = L.divIcon({
        className: '',
        html: '<div class="hub-marker">🛡️ ' + z.shortLabel + '</div>',
        iconSize: [64, 24], iconAnchor: [32, 12]
      });
      const m = L.marker([z.latitude, z.longitude], { icon: icon });
      m.on('click', () => {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SELECT_PLACE',
          place: {
            type: 'safe_zone',
            title: z.name,
            subtitle: 'Designated Safe Hub (' + (z.capacity || 'Open') + ')',
            description: z.description,
            latitude: z.latitude,
            longitude: z.longitude,
            badge: z.shortLabel
          }
        }));
      });
      zoneLayer.addLayer(m);
    });

    window.handleNativeMessage = function(data) {
      if (!data) return;

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
          const userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
          userMarker = L.marker(userPos, { icon: userIcon }).addTo(map);
        } else {
          userMarker.setLatLng(userPos);
        }
      } else if (data.type === 'SHOW_EVACUATION_ROUTE') {
        dynamicRouteGroup.clearLayers();
        const waypoints = data.waypoints;
        if (!waypoints || waypoints.length < 2) return;

        // Clean emerald evacuation polyline
        const path = L.polyline(waypoints, {
          color: '#059669',
          weight: 6,
          opacity: 0.9,
          dashArray: '8, 6',
          lineCap: 'round',
          lineJoin: 'round'
        });
        dynamicRouteGroup.addLayer(path);

        const startIcon = L.divIcon({
          className: '',
          html: '<div style="background:#dc2626; color:#fff; border:2px solid #fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 2px 5px rgba(0,0,0,0.4);">📍</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        dynamicRouteGroup.addLayer(L.marker([data.origin.latitude, data.origin.longitude], { icon: startIcon }));

        const destIcon = L.divIcon({
          className: '',
          html: '<div style="background:#059669; color:#fff; border:2px solid #fff; border-radius:14px; padding:3px 8px; font-weight:800; font-size:11px; box-shadow:0 2px 6px rgba(0,0,0,0.4);">🛡️ ' + (data.hubBadge || 'Safe Hub') + '</div>',
          iconSize: [80, 26],
          iconAnchor: [40, 13]
        });
        dynamicRouteGroup.addLayer(L.marker([data.destination.latitude, data.destination.longitude], { icon: destIcon }));

        map.fitBounds(L.latLngBounds(waypoints), {
          padding: [60, 60],
          maxZoom: 18,
          animate: true
        });
      } else if (data.type === 'CLEAR_EVACUATION_ROUTE') {
        dynamicRouteGroup.clearLayers();
      }
    };

    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
  </script>
</body>
</html>
`;

  return (
    <View style={styles.container}>
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
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.loadingText}>Loading Map...</Text>
          </View>
        )}
      />

      {/* CLEAN TOP HEADER CONTROLS */}
      <View style={styles.topBar}>
        <View style={styles.titlePill}>
          <Text style={styles.titlePillText}>Campus Map</Text>
        </View>

        <View style={styles.quickControls}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={handleRecenterUser}
            activeOpacity={0.8}
            accessibilityLabel="Center on GPS"
          >
            <Text style={styles.circleBtnText}>📍</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.circleBtn}
            onPress={toggleMapType}
            activeOpacity={0.8}
            accessibilityLabel="Toggle satellite"
          >
            <Text style={styles.circleBtnText}>{isSatellite ? '🗺️' : '🛰️'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BOTTOM SECTION */}
      {/* 1. When Active Evacuation Route is Displayed */}
      {activeEvacRoute && (
        <View style={styles.bottomCardContainer}>
          <View style={styles.evacCard}>
            <View style={styles.cardTopRow}>
              <View style={styles.evacTitleGroup}>
                <Text style={styles.evacIcon}>🛡️</Text>
                <View>
                  <Text style={styles.evacTarget}>{activeEvacRoute.targetZone.name}</Text>
                  <Text style={styles.evacSub}>
                    {activeEvacRoute.distanceMeters}m away • ~{activeEvacRoute.walkMinutes} min walk
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleClearRoute}
                style={styles.endBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.endBtnText}>End</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.instructionText}>
              Follow the green dashed path directly to the safe assembly area.
            </Text>

            {/* Hub Selector */}
            <View style={styles.hubSelectorRow}>
              <Text style={styles.hubSelectorLabel}>Switch Hub:</Text>
              {SAFE_ASSEMBLY_ZONES.map((zone) => {
                const isCurrent = zone.id === activeEvacRoute.targetZone.id;
                return (
                  <TouchableOpacity
                    key={zone.id}
                    style={[styles.hubOption, isCurrent && styles.hubOptionActive]}
                    onPress={() => startEvacuationRoute(activeEvacRoute.originCoords, activeEvacRoute.originTitle, zone)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.hubOptionText, isCurrent && styles.hubOptionTextActive]}>
                      {zone.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* 2. When No Route is Active: Big Clean Action Button */}
      {!activeEvacRoute && !selectedPlace && (
        <View style={styles.bottomCardContainer}>
          <TouchableOpacity
            style={styles.mainEvacBtn}
            onPress={handleTriggerEvacuate}
            activeOpacity={0.85}
          >
            <Text style={styles.mainEvacBtnIcon}>🚨</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.mainEvacBtnTitle}>Find Nearest Safe Zone</Text>
              <Text style={styles.mainEvacBtnSub}>Shows the fastest evacuation walking path</Text>
            </View>
            <Text style={styles.mainEvacBtnArrow}>→</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. When a Building is Tapped */}
      {!activeEvacRoute && selectedPlace && (
        <View style={styles.bottomCardContainer}>
          <View style={styles.placeCard}>
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.placeTitle}>{selectedPlace.title}</Text>
                <Text style={styles.placeSubtitle}>
                  {selectedPlace.subtitle}
                  {selectedPlace.latitude && selectedPlace.longitude
                    ? ` • ${getDistanceFromUser(selectedPlace.latitude, selectedPlace.longitude) || 'Campus'}`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedPlace(null)}
                style={styles.closePlaceBtn}
              >
                <Text style={styles.closePlaceText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.evacFromBtn}
              onPress={() => {
                startEvacuationRoute(
                  { latitude: selectedPlace.latitude!, longitude: selectedPlace.longitude! },
                  selectedPlace.title
                );
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.evacFromBtnText}>🏃 Evacuate from this Location</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
  },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titlePill: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  titlePillText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  quickControls: {
    flexDirection: 'row',
    gap: 8,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  circleBtnText: {
    fontSize: 16,
  },
  bottomCardContainer: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
  },
  mainEvacBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  mainEvacBtnIcon: {
    fontSize: 22,
  },
  mainEvacBtnTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  mainEvacBtnSub: {
    color: '#fee2e2',
    fontSize: 11,
    marginTop: 2,
  },
  mainEvacBtnArrow: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  evacCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#059669',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  evacTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  evacIcon: {
    fontSize: 24,
  },
  evacTarget: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  evacSub: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  endBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  endBtnText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '600',
  },
  instructionText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  hubSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
  },
  hubSelectorLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  hubOption: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  hubOptionActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  hubOptionText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  hubOptionTextActive: {
    color: '#ffffff',
  },
  placeCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  placeTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  placeSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  closePlaceBtn: {
    padding: 4,
  },
  closePlaceText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  evacFromBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  evacFromBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
