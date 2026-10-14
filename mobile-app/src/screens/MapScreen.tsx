import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import {
  MUNICIPAL_CENTER,
  SAFE_ASSEMBLY_ZONES,
  COMMUNITY_FACILITIES,
  SafeAssemblyZone,
  LatLng,
  getOfflineRoadWaypoints,
} from '../constants/geoData';
import { alertService, ResidentStatus } from '../services/alertService';
import { getStoredResidentStatus, setStoredResidentStatus } from '../utils/deviceIdentity';
import { reportRepository } from '../database/reportRepository';
import { syncService } from '../sync/syncService';
import { ReliefSupply } from '../types/voucher';

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

/**
 * Smart Road Routing Engine
 * Queries OSRM walking network to strictly route along streets and footpaths.
 * Falls back to verified Kabacan municipal street intersections when offline.
 */
async function calculateSmartRoadRoute(
  origin: LatLng,
  targetHub: SafeAssemblyZone
): Promise<{ waypoints: [number, number][]; distanceMeters: number; walkMinutes: number }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const url = `https://router.project-osrm.org/route/v1/foot/${origin.longitude},${origin.latitude};${targetHub.longitude},${targetHub.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const route = data.routes[0];
        const rawCoords: [number, number][] = route.geometry.coordinates.map(
          (pt: [number, number]) => [pt[1], pt[0]]
        );
        const waypoints: [number, number][] = [
          [origin.latitude, origin.longitude],
          ...rawCoords,
          [targetHub.latitude, targetHub.longitude],
        ];
        const distanceMeters = Math.max(20, Math.round(route.distance));
        const walkMinutes = Math.max(1, Math.ceil(route.duration / 60));
        return { waypoints, distanceMeters, walkMinutes };
      }
    }
  } catch (err) {
    console.log('[Router] OSRM live routing unreachable, using municipal road network fallback.');
  }

  // Authoritative municipal road network fallback (Poblacion streets)
  const waypoints = getOfflineRoadWaypoints(origin, targetHub);
  let totalDist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDist += calculateDistanceMeters(
      waypoints[i][0],
      waypoints[i][1],
      waypoints[i + 1][0],
      waypoints[i + 1][1]
    );
  }
  const distanceMeters = Math.max(30, Math.round(totalDist));
  const walkMinutes = Math.max(1, Math.ceil(distanceMeters / 75));
  return { waypoints, distanceMeters, walkMinutes };
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
    type: 'building' | 'safe_zone' | 'supply_drop';
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

  // Resident safety status ('SAFE' vs 'DANGER') - mirrors PWA logic
  const [residentStatus, setResidentStatus] = useState<ResidentStatus>('SAFE');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Relief supplies marked by admin
  const [activeSupplies, setActiveSupplies] = useState<ReliefSupply[]>([]);

  const postMessageToWeb = useCallback((msg: object) => {
    const js = `window.handleNativeMessage && window.handleNativeMessage(${JSON.stringify(msg)}); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, []);

  useEffect(() => {
    // 1. Read stored status from SQLite
    getStoredResidentStatus().then((status) => {
      setResidentStatus(status);
    });

    // 2. Subscribe to real-time status updates from alertService
    const unsubscribeStatus = alertService.subscribeResidentStatus((status) => {
      setResidentStatus(status);
    });

    // 3. Subscribe to real-time relief supplies marked by admin
    const unsubscribeSupplies = alertService.subscribeSupplies((supplies) => {
      setActiveSupplies(supplies);
      postMessageToWeb({ type: 'UPDATE_SUPPLIES', supplies });
    });

    // 4. Load initial cached relief supplies
    const initialSupplies = alertService.getActiveSupplies();
    if (initialSupplies.length > 0) {
      setActiveSupplies(initialSupplies);
      postMessageToWeb({ type: 'UPDATE_SUPPLIES', supplies: initialSupplies });
    } else {
      alertService.fetchActiveSupplies().then((supplies) => {
        setActiveSupplies(supplies);
        postMessageToWeb({ type: 'UPDATE_SUPPLIES', supplies });
      }).catch(() => {});
    }

    return () => {
      unsubscribeStatus();
      unsubscribeSupplies();
    };
  }, [postMessageToWeb]);

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
    async (origin: LatLng, originName: string, requestedHub?: SafeAssemblyZone) => {
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

      // Compute exact road-following route via OSRM / Municipal Street Network
      const { waypoints, distanceMeters, walkMinutes } = await calculateSmartRoadRoute(
        origin,
        targetHub
      );

      const routeData: ActiveEvacRoute = {
        originTitle: originName,
        originCoords: origin,
        targetZone: targetHub,
        distanceMeters,
        walkMinutes,
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
    let origin = MUNICIPAL_CENTER;
    let title = 'Municipal Center';

    if (userCoords) {
      const distFromCenter = calculateDistanceMeters(
        userCoords.latitude,
        userCoords.longitude,
        MUNICIPAL_CENTER.latitude,
        MUNICIPAL_CENTER.longitude
      );
      if (distFromCenter < 2500) {
        origin = userCoords;
        title = 'Your Location';
      } else {
        origin = { latitude: COMMUNITY_FACILITIES[0].latitude, longitude: COMMUNITY_FACILITIES[0].longitude };
        title = `${COMMUNITY_FACILITIES[0].name}`;
      }
    } else {
      origin = { latitude: COMMUNITY_FACILITIES[0].latitude, longitude: COMMUNITY_FACILITIES[0].longitude };
      title = `${COMMUNITY_FACILITIES[0].name}`;
    }

    startEvacuationRoute(origin, title);
  }, [userCoords, startEvacuationRoute]);

  const handleClearRoute = () => {
    setActiveEvacRoute(null);
    postMessageToWeb({ type: 'CLEAR_EVACUATION_ROUTE' });
  };

  /**
   * Mark as Safe - Exactly mirrors PWA markAsSafe() logic:
   * 1. Confirms with resident
   * 2. Clears active evacuation route HUD
   * 3. Emits student-status 'SAFE' to Socket.io and updates SQLite
   * 4. Updates Admin Console map marker to green blip-safe & increments safe counter
   */
  const handleMarkSafe = useCallback(() => {
    Alert.alert(
      'Mark as Safe?',
      'This will inform MDRRMO Central Dispatch that you are safe in a secure location.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "Yes, I'm Safe",
          onPress: async () => {
            setIsUpdatingStatus(true);
            try {
              if (activeEvacRoute) {
                handleClearRoute();
              }
              try {
                Vibration.vibrate(100);
              } catch {}
              setResidentStatus('SAFE');
              await setStoredResidentStatus('SAFE');
              await alertService.updateResidentStatus('SAFE', userCoords, 10);
              Alert.alert('✅ Marked as SAFE', 'MDRRMO Central Dispatch has received your safety confirmation.');
            } catch (err) {
              console.warn('[MapScreen] Error marking safe:', err);
            } finally {
              setIsUpdatingStatus(false);
            }
          },
        },
      ]
    );
  }, [activeEvacRoute, userCoords, handleClearRoute]);

  /**
   * Mark as Not Safe - Exactly mirrors PWA markAsDanger() logic:
   * 1. Vibrates emergency haptic pulse
   * 2. Sets status to DANGER and emits student-status 'DANGER' to Socket.io
   * 3. Saves offline SOS emergency incident in local SQLite
   * 4. Automatically activates smart road route to nearest safe hub
   * 5. Prompts Admin Console with emergency chime, red pulsing marker, and reply capability
   */
  const handleMarkNotSafe = useCallback(async () => {
    setIsUpdatingStatus(true);
    try {
      try {
        Vibration.vibrate([0, 300, 150, 300]);
      } catch {}

      setResidentStatus('DANGER');
      await setStoredResidentStatus('DANGER');
      await alertService.updateResidentStatus('DANGER', userCoords, 10);

      // Offline-first: Guarantee SQLite emergency record is saved
      try {
        await reportRepository.createReport({
          category: 'TRAPPED',
          severity: 'CRITICAL',
          description: '🚨 RESIDENT IN DANGER: Pressed "I\'M NOT SAFE". SOS dispatched to MDRRMO Central Command.',
          nearestBuilding: 'Kabacan Community Area',
          latitude: userCoords?.latitude || null,
          longitude: userCoords?.longitude || null,
          contactInformation: {
            isAnonymous: true,
          },
        });
        // Background sync attempt
        syncService.syncPendingReports().catch(() => {});
      } catch (dbErr) {
        console.warn('[MapScreen] Failed to save SOS report to SQLite:', dbErr);
      }

      // Automatically calculate and activate smart road evacuation route to nearest safe hub
      handleTriggerEvacuate();

      Alert.alert(
        '🚨 Emergency SOS Dispatched',
        'MDRRMO Central Command has received your distress alert.\n\nSmart road evacuation route has been activated to guide you to the nearest municipal safe hub.',
        [{ text: 'Proceed to Safe Hub' }]
      );
    } catch (err) {
      console.warn('[MapScreen] Error marking not safe:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [userCoords, handleTriggerEvacuate]);

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

  const handleRecenterCenter = () => {
    postMessageToWeb({ type: 'RECENTER_CENTER' });
  };

  const handleRecenterUser = () => {
    if (!userCoords) {
      if (locationPermission === 'denied') {
        Alert.alert('Location Disabled', 'Please enable location in phone settings to see your position.');
      } else {
        Alert.alert('Acquiring GPS', 'Looking for GPS fix. Centering on Municipal Center.');
        handleRecenterCenter();
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
        if (activeSupplies.length > 0) {
          postMessageToWeb({ type: 'UPDATE_SUPPLIES', supplies: activeSupplies });
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
    .supply-marker {
      background: #ea580c; border: 2px solid #ffffff; border-radius: 14px;
      padding: 3px 8px; color: #ffffff; font-weight: 800; font-size: 11px;
      display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(234,88,12,0.5);
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
    const MUNICIPAL_CENTER_POS = [${MUNICIPAL_CENTER.latitude}, ${MUNICIPAL_CENTER.longitude}];
    const map = L.map('map', { zoomControl: false }).setView(MUNICIPAL_CENTER_POS, 18);

    const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });

    let userMarker = null;
    let bldgLayer = L.layerGroup().addTo(map);
    let zoneLayer = L.layerGroup().addTo(map);
    let supplyLayer = L.layerGroup().addTo(map);
    let dynamicRouteGroup = L.layerGroup().addTo(map);

    const BUILDINGS = ${JSON.stringify(COMMUNITY_FACILITIES)};
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
            description: 'Community facility. Tap Evacuate to see path to nearest safe hub.',
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
      } else if (data.type === 'RECENTER_CENTER') {
        map.setView(MUNICIPAL_CENTER_POS, 18, { animate: true });
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

        // High-contrast dual-layer road polyline
        const roadCasing = L.polyline(waypoints, {
          color: '#064e3b',
          weight: 8,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round'
        });
        dynamicRouteGroup.addLayer(roadCasing);

        const roadCenter = L.polyline(waypoints, {
          color: '#10b981',
          weight: 4,
          opacity: 1.0,
          lineCap: 'round',
          lineJoin: 'round'
        });
        dynamicRouteGroup.addLayer(roadCenter);

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
      } else if (data.type === 'RECENTER_COORDS' && data.coords) {
        map.setView([data.coords.latitude, data.coords.longitude], 18, { animate: true });
      } else if (data.type === 'UPDATE_SUPPLIES') {
        supplyLayer.clearLayers();
        if (Array.isArray(data.supplies)) {
          data.supplies.forEach(function(s) {
            const icon = L.divIcon({
              className: '',
              html: '<div class="supply-marker">📦 Relief Aid</div>',
              iconSize: [84, 24],
              iconAnchor: [42, 12]
            });
            const m = L.marker([s.latitude, s.longitude], { icon: icon });
            m.on('click', function() {
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SELECT_PLACE',
                place: {
                  type: 'supply_drop',
                  title: 'Relief Supply Point',
                  subtitle: s.message || 'Supplies available here',
                  description: 'Marked by MDRRMO Admin for community relief distribution.',
                  latitude: s.latitude,
                  longitude: s.longitude,
                  badge: '📦'
                }
              }));
            });
            supplyLayer.addLayer(m);
          });
        }
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
          <Text style={styles.titlePillText}>Municipal Evacuation Map</Text>
        </View>

        <View style={styles.quickControls}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={handleRecenterUser}
            activeOpacity={0.8}
            accessibilityLabel="Center on GPS"
          >
            <Text style={styles.circleBtnText}>GPS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.circleBtn}
            onPress={toggleMapType}
            activeOpacity={0.8}
            accessibilityLabel="Toggle satellite"
          >
            <Text style={styles.circleBtnText}>{isSatellite ? 'Map' : 'Sat'}</Text>
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
                accessibilityLabel="End route"
              >
                <Text style={styles.endBtnText}>End Route</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.instructionText}>
              Follow the green dashed street route directly to the designated safe zone.
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

            {/* Arrived / Mark Safe Action */}
            <TouchableOpacity
              style={styles.arrivedSafeBtn}
              onPress={handleMarkSafe}
              activeOpacity={0.85}
              disabled={isUpdatingStatus}
            >
              <Text style={styles.arrivedSafeBtnText}>I've Arrived / Mark as Safe</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 2. When No Route is Active: Dual Emergency Status Controls (Matching PWA student.html) */}
      {!activeEvacRoute && !selectedPlace && (
        <View style={styles.bottomCardContainer}>
          <View style={styles.statusPanelCard}>
            {/* Live Status Pill Header */}
            <View style={styles.statusHeaderRow}>
              <View
                style={[
                  styles.statusIndicatorPill,
                  residentStatus === 'SAFE' ? styles.statusPillSafe : styles.statusPillDanger,
                ]}
              >
                <View
                  style={[
                    styles.statusPillDot,
                    residentStatus === 'SAFE' ? styles.statusDotSafe : styles.statusDotDanger,
                  ]}
                />
                <Text
                  style={[
                    styles.statusPillText,
                    residentStatus === 'SAFE' ? styles.statusTextSafe : styles.statusTextDanger,
                  ]}
                >
                  {residentStatus === 'SAFE' ? 'STATUS: SAFE' : 'STATUS: IN DANGER / SOS'}
                </Text>
              </View>

              <Text style={styles.statusGpsNote}>
                {userCoords ? 'Live GPS Active' : 'Acquiring GPS...'}
              </Text>
            </View>

            {/* The Two Main Action Buttons side-by-side (54px min height for emergency resilience) */}
            <View style={styles.statusButtonGroup}>
              {/* I'M SAFE BUTTON */}
              <TouchableOpacity
                style={[
                  styles.statusActionBtn,
                  styles.btnSafe,
                  residentStatus === 'SAFE' && styles.btnSafeActive,
                ]}
                onPress={handleMarkSafe}
                disabled={isUpdatingStatus}
                activeOpacity={0.8}
                accessibilityLabel="Mark as safe"
              >
                <View style={styles.btnTextCol}>
                  <Text style={styles.btnSafeTitle}>I'M SAFE</Text>
                  <Text style={styles.btnSafeSubtitle}>Mark as Safe</Text>
                </View>
              </TouchableOpacity>

              {/* I'M NOT SAFE / SOS BUTTON */}
              <TouchableOpacity
                style={[
                  styles.statusActionBtn,
                  styles.btnDanger,
                  residentStatus === 'DANGER' && styles.btnDangerActive,
                ]}
                onPress={handleMarkNotSafe}
                disabled={isUpdatingStatus}
                activeOpacity={0.8}
                accessibilityLabel="Declare emergency SOS and evacuate"
              >
                <View style={styles.btnTextCol}>
                  <Text style={styles.btnDangerTitle}>I'M NOT SAFE</Text>
                  <Text style={styles.btnDangerSubtitle}>SOS & Evacuate</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 3. When a Place or Supply Marker is Tapped */}
      {!activeEvacRoute && selectedPlace && (
        <View style={styles.bottomCardContainer}>
          {selectedPlace.type === 'supply_drop' ? (
            /* RELIEF SUPPLY MARKER CARD: NO ROUTE, JUST MARKING & FOCUS */
            <View style={styles.supplyCard}>
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.supplyBadge}>
                    <Text style={styles.supplyBadgeText}>RELIEF SUPPLY POINT</Text>
                  </View>
                  <Text style={styles.placeTitle}>{selectedPlace.title}</Text>
                  <Text style={styles.placeSubtitle}>
                    {selectedPlace.subtitle}
                    {selectedPlace.latitude && selectedPlace.longitude
                      ? ` • ${getDistanceFromUser(selectedPlace.latitude, selectedPlace.longitude) || 'Nearby'}`
                      : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedPlace(null)}
                  style={styles.closePlaceBtn}
                  accessibilityLabel="Close supply card"
                >
                  <Text style={styles.closePlaceText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.supplyDescText}>
                {selectedPlace.description || 'Marked by MDRRMO Admin. Relief supplies are available at this station.'}
              </Text>

              <TouchableOpacity
                style={styles.centerSupplyBtn}
                onPress={() => {
                  if (selectedPlace.latitude && selectedPlace.longitude) {
                    postMessageToWeb({
                      type: 'RECENTER_COORDS',
                      coords: { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude },
                    });
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.centerSupplyBtnText}>Center on Supply Location</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Regular Facility / Safe Zone */
            <View style={styles.placeCard}>
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeTitle}>{selectedPlace.title}</Text>
                  <Text style={styles.placeSubtitle}>
                    {selectedPlace.subtitle}
                    {selectedPlace.latitude && selectedPlace.longitude
                      ? ` • ${getDistanceFromUser(selectedPlace.latitude, selectedPlace.longitude) || 'Nearby'}`
                      : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedPlace(null)}
                  style={styles.closePlaceBtn}
                  accessibilityLabel="Close place card"
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
                <Text style={styles.evacFromBtnText}>Evacuate from this Location</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#475569',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  titlePillText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  quickControls: {
    flexDirection: 'row',
    gap: 8,
  },
  circleBtn: {
    minWidth: 42,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  circleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  bottomCardContainer: {
    position: 'absolute',
    bottom: 74,
    left: 14,
    right: 14,
  },
  statusPanelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  statusIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillSafe: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  statusPillDanger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotSafe: {
    backgroundColor: '#16A34A',
  },
  statusDotDanger: {
    backgroundColor: '#DC2626',
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  statusTextSafe: {
    color: '#15803D',
  },
  statusTextDanger: {
    color: '#B91C1C',
  },
  statusGpsNote: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  statusButtonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  statusActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    minHeight: 54,
  },
  btnSafe: {
    backgroundColor: '#16A34A',
    borderWidth: 1,
    borderColor: '#15803D',
  },
  btnSafeActive: {
    backgroundColor: '#15803D',
  },
  btnSafeTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  btnSafeSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  btnDanger: {
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#B91C1C',
  },
  btnDangerActive: {
    backgroundColor: '#B91C1C',
  },
  btnDangerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  btnDangerSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  btnTextCol: {
    alignItems: 'center',
  },
  arrivedSafeBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  arrivedSafeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  evacCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0F766E',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  evacTitleGroup: {
    flex: 1,
  },
  evacTarget: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  evacSub: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  endBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  endBtnText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '700',
  },
  instructionText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  hubSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  hubSelectorLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  hubOption: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  hubOptionActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  hubOptionText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  hubOptionTextActive: {
    color: '#FFFFFF',
  },
  placeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  placeTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  placeSubtitle: {
    color: '#475569',
    fontSize: 12,
    marginTop: 2,
  },
  closePlaceBtn: {
    padding: 4,
  },
  closePlaceText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  evacFromBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  evacFromBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  supplyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EA580C',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  supplyBadge: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFEDD5',
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  supplyBadgeText: {
    color: '#EA580C',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  supplyDescText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
    marginBottom: 10,
  },
  centerSupplyBtn: {
    backgroundColor: '#EA580C',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  centerSupplyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
