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
  EVACUATION_ROUTES,
  SafeAssemblyZone,
  CampusBuilding,
  LatLng,
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
  activeDisaster,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Layer toggles
  const [showBuildings, setShowBuildings] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);

  // Active Intelligent Evacuation Route
  const [activeEvacRoute, setActiveEvacRoute] = useState<ActiveEvacRoute | null>(null);

  // Selected place for bottom info card (when not navigating)
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
  const [userCoords, setUserCoords] = useState<LatLng | null>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Send message to embedded Leaflet webview
  const postMessageToWeb = useCallback((msg: object) => {
    const js = `window.handleNativeMessage && window.handleNativeMessage(${JSON.stringify(msg)}); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, []);

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
  }, [postMessageToWeb]);

  /**
   * Intelligently computes the best evacuation path from an origin point to a designated safe hub.
   * If no specific hub is requested, picks the closest Safe Assembly Zone.
   */
  const startEvacuationRoute = useCallback(
    (origin: LatLng, originName: string, requestedHub?: SafeAssemblyZone) => {
      // 1. Identify destination Safe Hub
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

      // 2. Generate intelligent campus walkway waypoints
      // Central KNHS quadrangle walkway connector [7.10030, 124.82400]
      const quadrangleConnector: [number, number] = [7.10030, 124.82400];
      const startPoint: [number, number] = [origin.latitude, origin.longitude];
      const endPoint: [number, number] = [targetHub.latitude, targetHub.longitude];

      // Calculate direct distance or via central walkway
      const directDist = calculateDistanceMeters(
        origin.latitude,
        origin.longitude,
        targetHub.latitude,
        targetHub.longitude
      );

      let waypoints: [number, number][] = [startPoint, endPoint];
      // If over 50 meters, route through central quadrangle corridor for realistic walkway guidance
      if (directDist > 50) {
        waypoints = [startPoint, quadrangleConnector, endPoint];
      }

      const totalMeters = Math.max(25, directDist);
      const estMinutes = Math.max(1, Math.ceil(totalMeters / 75)); // Average brisk evacuation pace ~75m/min

      const routeData: ActiveEvacRoute = {
        originTitle: originName,
        originCoords: origin,
        targetZone: targetHub,
        distanceMeters: totalMeters,
        walkMinutes: estMinutes,
        waypoints,
      };

      setActiveEvacRoute(routeData);
      setSelectedPlace(null); // Dismiss building card to highlight route

      // Send instruction to embedded Leaflet map
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

  /**
   * One-tap Emergency Evacuate:
   * Uses user GPS if available near campus, or defaults to central Building A for demo reliability.
   */
  const handleTriggerEvacuate = useCallback(() => {
    let origin = CAMPUS_CENTER;
    let title = 'Campus Central Grounds';

    if (userCoords) {
      // Check if user is within ~2km of KNHS campus
      const distFromCampus = calculateDistanceMeters(
        userCoords.latitude,
        userCoords.longitude,
        CAMPUS_CENTER.latitude,
        CAMPUS_CENTER.longitude
      );
      if (distFromCampus < 2500) {
        origin = userCoords;
        title = 'Your Current GPS Location';
      } else {
        // User is testing off-campus: use closest representative building
        origin = { latitude: CAMPUS_BUILDINGS[0].latitude, longitude: CAMPUS_BUILDINGS[0].longitude };
        title = `${CAMPUS_BUILDINGS[0].name} (Demo Start)`;
      }
    } else {
      origin = { latitude: CAMPUS_BUILDINGS[0].latitude, longitude: CAMPUS_BUILDINGS[0].longitude };
      title = `${CAMPUS_BUILDINGS[0].name} (Campus Entry)`;
    }

    startEvacuationRoute(origin, title);
  }, [userCoords, startEvacuationRoute]);

  /**
   * Handle clearing route guidance
   */
  const handleClearRoute = () => {
    setActiveEvacRoute(null);
    postMessageToWeb({ type: 'CLEAR_EVACUATION_ROUTE' });
  };

  /**
   * Auto-trigger route when navigation is requested from alert banner or popup
   */
  useEffect(() => {
    if (initialAutoRoute && mapLoaded) {
      handleTriggerEvacuate();
      if (onClearAutoRoute) {
        onClearAutoRoute();
      }
    }
  }, [initialAutoRoute, mapLoaded, handleTriggerEvacuate, onClearAutoRoute]);

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

  // Generate self-contained Leaflet HTML with OpenStreetMap, Satellite, and Dynamic Route Engine
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
    @keyframes pulseRoute {
      0% { opacity: 0.8; stroke-width: 6; }
      50% { opacity: 1.0; stroke-width: 8; }
      100% { opacity: 0.8; stroke-width: 6; }
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
    let dynamicRouteGroup = L.layerGroup().addTo(map);

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
            description: 'Campus designated academic building. Follow marked evacuation path to safe hub.',
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

    // Render 3 Static Evacuation Corridor Reference Lines
    ROUTES.forEach(r => {
      const pts = r.coordinates.map(c => [c.latitude, c.longitude]);
      const poly = L.polyline(pts, { color: r.color, weight: 4, opacity: 0.6, dashArray: '6, 6' });
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
          const userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
          userMarker = L.marker(userPos, { icon: userIcon }).addTo(map);
        } else {
          userMarker.setLatLng(userPos);
        }
      } else if (data.type === 'TOGGLE_LAYER') {
        if (data.layer === 'buildings') data.visible ? map.addLayer(bldgLayer) : map.removeLayer(bldgLayer);
        if (data.layer === 'safeZones') data.visible ? map.addLayer(zoneLayer) : map.removeLayer(zoneLayer);
        if (data.layer === 'routes') data.visible ? map.addLayer(routeLayer) : map.removeLayer(routeLayer);
      } else if (data.type === 'SHOW_EVACUATION_ROUTE') {
        dynamicRouteGroup.clearLayers();

        const waypoints = data.waypoints;
        if (!waypoints || waypoints.length < 2) return;

        // 1. Glowing outer halo polyline (bold red)
        const outerGlow = L.polyline(waypoints, {
          color: '#ef4444',
          weight: 12,
          opacity: 0.45,
          lineCap: 'round',
          lineJoin: 'round'
        });
        dynamicRouteGroup.addLayer(outerGlow);

        // 2. High-visibility animated dashed emerald inner line
        const innerLine = L.polyline(waypoints, {
          color: '#10b981',
          weight: 6,
          opacity: 1.0,
          dashArray: '10, 8',
          lineCap: 'round',
          lineJoin: 'round'
        });
        dynamicRouteGroup.addLayer(innerLine);

        // 3. Start Point Marker (Runner Icon)
        const startIcon = L.divIcon({
          className: '',
          html: '<div style="background:#ef4444; color:#ffffff; border:2.5px solid #ffffff; border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 0 16px rgba(239,68,68,0.9);">🏃</div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });
        const startMarker = L.marker([data.origin.latitude, data.origin.longitude], { icon: startIcon });
        dynamicRouteGroup.addLayer(startMarker);

        // 4. Destination Safe Hub Marker (Pulsing Shield Badge)
        const destIcon = L.divIcon({
          className: '',
          html: '<div style="background:#059669; color:#ffffff; border:2.5px solid #fef08a; border-radius:18px; padding:5px 12px; font-weight:900; font-size:11px; display:flex; align-items:center; gap:5px; box-shadow:0 0 20px rgba(16,185,129,0.9); white-space:nowrap;">🛡️ ' + (data.hubBadge || 'SAFE HUB') + '</div>',
          iconSize: [110, 32],
          iconAnchor: [55, 16]
        });
        const destMarker = L.marker([data.destination.latitude, data.destination.longitude], { icon: destIcon });
        dynamicRouteGroup.addLayer(destMarker);

        // 5. Intelligent Camera Auto-Fit: Bring entire route into clear focus
        const bounds = L.latLngBounds(waypoints);
        map.fitBounds(bounds, {
          padding: [75, 75],
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

      {/* PROMINENT ONE-TAP EVACUATE BUTTON (TOP LEFT BELOW HEADER) */}
      <View style={styles.evacTriggerContainer}>
        <TouchableOpacity
          style={[
            styles.evacTriggerBtn,
            activeEvacRoute ? styles.evacTriggerBtnActive : styles.evacTriggerBtnDanger,
          ]}
          onPress={activeEvacRoute ? () => {
            // Re-fit camera to route
            postMessageToWeb({
              type: 'SHOW_EVACUATION_ROUTE',
              origin: activeEvacRoute.originCoords,
              destination: { latitude: activeEvacRoute.targetZone.latitude, longitude: activeEvacRoute.targetZone.longitude },
              waypoints: activeEvacRoute.waypoints,
              hubName: activeEvacRoute.targetZone.name,
              hubBadge: activeEvacRoute.targetZone.shortLabel,
            });
          } : handleTriggerEvacuate}
          activeOpacity={0.85}
        >
          <Text style={styles.evacTriggerIcon}>
            {activeEvacRoute ? '🎯' : '🚨'}
          </Text>
          <View>
            <Text style={styles.evacTriggerTitle}>
              {activeEvacRoute
                ? `ROUTING: ${activeEvacRoute.targetZone.shortLabel} (${activeEvacRoute.distanceMeters}m)`
                : 'EVACUATE NOW: SHOW ROUTE'}
            </Text>
            <Text style={styles.evacTriggerSub}>
              {activeEvacRoute
                ? 'Tap to re-center evacuation path'
                : 'Finds nearest safe assembly hub'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ACTIVE INTELLIGENT EVACUATION GUIDANCE CARD (BOTTOM OVERLAY) */}
      {activeEvacRoute && (
        <View style={styles.guidanceCardContainer}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceHeader}>
              <View style={styles.guidanceTagRow}>
                <View style={styles.guidanceBadge}>
                  <Text style={styles.guidanceBadgeText}>🚨 ACTIVE EVACUATION ROUTE</Text>
                </View>
                <Text style={styles.guidanceTimeTag}>~{activeEvacRoute.walkMinutes} MIN WALK</Text>
              </View>

              <TouchableOpacity
                onPress={handleClearRoute}
                style={styles.guidanceCloseBtn}
                accessibilityLabel="Clear evacuation route"
              >
                <Text style={styles.guidanceCloseText}>✕ End Route</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.guidanceTargetName}>
              🛡️ {activeEvacRoute.targetZone.name}
            </Text>
            <Text style={styles.guidanceOrigin}>
              From: <Text style={{ color: '#f1f5f9', fontWeight: '700' }}>{activeEvacRoute.originTitle}</Text>
            </Text>

            {/* Metrics Bar */}
            <View style={styles.metricsBar}>
              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>{activeEvacRoute.distanceMeters}m</Text>
                <Text style={styles.metricLabel}>Distance</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>~{activeEvacRoute.walkMinutes} min</Text>
                <Text style={styles.metricLabel}>Walk Time</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>{activeEvacRoute.targetZone.capacity || 'Open'}</Text>
                <Text style={styles.metricLabel}>Safe Capacity</Text>
              </View>
            </View>

            <Text style={styles.guidanceInstruction}>
              🚶 Follow marked glowing green path. Proceed through campus corridor directly to {activeEvacRoute.targetZone.shortLabel}.
            </Text>

            {/* Alternate Safe Hub Switcher */}
            <View style={styles.hubSwitcherBox}>
              <Text style={styles.hubSwitcherTitle}>Switch Hub Destination:</Text>
              <View style={styles.hubBtnRow}>
                {SAFE_ASSEMBLY_ZONES.map((zone) => {
                  const isCurrent = zone.id === activeEvacRoute.targetZone.id;
                  return (
                    <TouchableOpacity
                      key={zone.id}
                      style={[styles.hubSwitchBtn, isCurrent && styles.hubSwitchBtnActive]}
                      onPress={() => startEvacuationRoute(activeEvacRoute.originCoords, activeEvacRoute.originTitle, zone)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.hubSwitchBtnText, isCurrent && styles.hubSwitchBtnTextActive]}>
                        {zone.shortLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* BOTTOM SELECTED PLACE DETAIL CARD (WHEN NOT EVACUATING) */}
      {!activeEvacRoute && selectedPlace && (
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

            {/* Action Buttons: Evacuate from this location OR Focus */}
            <View style={styles.actionBtnRow}>
              {selectedPlace.latitude && selectedPlace.longitude && (
                <TouchableOpacity
                  style={styles.evacFromPlaceBtn}
                  onPress={() => {
                    startEvacuationRoute(
                      { latitude: selectedPlace.latitude!, longitude: selectedPlace.longitude! },
                      selectedPlace.title
                    );
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.evacFromPlaceBtnText}>🏃 Evacuate From Here</Text>
                </TouchableOpacity>
              )}

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
                  activeOpacity={0.8}
                >
                  <Text style={styles.focusBtnText}>🎯 Focus</Text>
                </TouchableOpacity>
              )}
            </View>
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
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusPill: {
    backgroundColor: 'rgba(12, 23, 18, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#f1f5f9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  layerChipText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
  },
  layerChipTextActive: {
    color: '#ffffff',
  },
  // ONE-TAP EVACUATE BUTTON
  evacTriggerContainer: {
    position: 'absolute',
    top: 50,
    left: 12,
  },
  evacTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 5,
  },
  evacTriggerBtnDanger: {
    backgroundColor: '#dc2626',
    borderWidth: 1.5,
    borderColor: '#fca5a5',
  },
  evacTriggerBtnActive: {
    backgroundColor: '#059669',
    borderWidth: 1.5,
    borderColor: '#6ee7b7',
  },
  evacTriggerIcon: {
    fontSize: 18,
  },
  evacTriggerTitle: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  evacTriggerSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9.5,
    fontWeight: '600',
  },
  // CONTROLS GROUP
  controlsGroup: {
    position: 'absolute',
    right: 12,
    top: 95,
    gap: 8,
  },
  controlBtn: {
    backgroundColor: 'rgba(12, 23, 18, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: 58,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  controlBtnActive: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  controlIcon: {
    fontSize: 17,
    marginBottom: 2,
  },
  controlBtnText: {
    color: '#cbd5e1',
    fontSize: 9.5,
    fontWeight: '800',
  },
  // ACTIVE EVACUATION GUIDANCE CARD
  guidanceCardContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  guidanceCard: {
    backgroundColor: '#0c1712',
    borderWidth: 2,
    borderColor: '#10b981',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  guidanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  guidanceTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guidanceBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  guidanceBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  guidanceTimeTag: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '800',
  },
  guidanceCloseBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  guidanceCloseText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  guidanceTargetName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 2,
  },
  guidanceOrigin: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 10,
  },
  metricsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  metricVal: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 1,
  },
  guidanceInstruction: {
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 10,
  },
  hubSwitcherBox: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 8,
  },
  hubSwitcherTitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
  },
  hubBtnRow: {
    flexDirection: 'row',
    gap: 6,
  },
  hubSwitchBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
  },
  hubSwitchBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#10b981',
  },
  hubSwitchBtnText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '800',
  },
  hubSwitchBtnTextActive: {
    color: '#ffffff',
  },
  // DETAIL CARD (WHEN NOT ROUTING)
  detailCardContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  detailCard: {
    backgroundColor: '#0c1712',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
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
    gap: 8,
    flex: 1,
  },
  badgePill: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePillText: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: '900',
  },
  detailTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  detailSubtitle: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailDesc: {
    color: '#cbd5e1',
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 8,
  },
  distanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  distanceLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  distanceValue: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '800',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  evacFromPlaceBtn: {
    flex: 2,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evacFromPlaceBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  focusBtn: {
    flex: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusBtnText: {
    color: '#10b981',
    fontSize: 11.5,
    fontWeight: '800',
  },
});
