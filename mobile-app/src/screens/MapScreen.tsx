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
import { soundService } from '../services/soundService';

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
  targetHub: SafeAssemblyZone,
  forceOffline: boolean = false
): Promise<{ waypoints: [number, number][]; distanceMeters: number; walkMinutes: number }> {
  if (!forceOffline) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
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
  }

  // Authoritative municipal road network fallback (Poblacion streets) - 0ms instant
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
  isOffline?: boolean;
  onOpenReportModal?: () => void;
}

export const MapScreen: React.FC<MapScreenProps> = ({
  initialAutoRoute = false,
  onClearAutoRoute,
  activeDisaster,
  isOffline = false,
  onOpenReportModal,
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

  // Live GPS tracking - initialized to MUNICIPAL_CENTER so marker is NEVER missing
  const [userCoords, setUserCoords] = useState<LatLng>(MUNICIPAL_CENTER);
  const userCoordsRef = useRef<LatLng>(MUNICIPAL_CENTER);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'pending'>('pending');

  // Emergency siren playback state
  const [isSirenActive, setIsSirenActive] = useState<boolean>(soundService.isPlaying());

  // Resident safety status ('SAFE' vs 'DANGER') - mirrors PWA logic
  const [residentStatus, setResidentStatus] = useState<ResidentStatus>('SAFE');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Relief supplies marked by admin
  const [activeSupplies, setActiveSupplies] = useState<ReliefSupply[]>([]);

  const postMessageToWeb = useCallback((msg: object) => {
    const js = `window.handleNativeMessage && window.handleNativeMessage(${JSON.stringify(msg)}); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, []);

  // Sync ref with state
  useEffect(() => {
    userCoordsRef.current = userCoords;
  }, [userCoords]);

  // Keep siren audio listener active
  useEffect(() => {
    const unsub = soundService.subscribe((action) => {
      setIsSirenActive(action === 'PLAY_SIREN');
    });
    return () => unsub();
  }, []);

  // Guarantee that whenever the Leaflet webview is loaded or userCoords updates,
  // the user location pulse marker is immediately rendered on the map
  useEffect(() => {
    if (mapLoaded && userCoords) {
      postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords: userCoords });
    }
  }, [mapLoaded, userCoords, postMessageToWeb]);

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
    let isMounted = true;

    async function initLocation() {
      try {
        // 1. Check if device location services (GPS toggle in Android settings) are enabled
        const hasServices = await Location.hasServicesEnabledAsync().catch(() => true);
        if (!hasServices) {
          console.warn('[MapScreen] Android device location services are disabled');
        }

        // 2. Request foreground permissions
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (isMounted) {
            setLocationPermission('denied');
          }
          return;
        }

        if (isMounted) setLocationPermission('granted');

        // 3. Fast cached last known position
        try {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (isMounted && lastKnown && lastKnown.coords) {
            const coords = {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
            };
            setUserCoords(coords);
            userCoordsRef.current = coords;
            postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords });
          }
        } catch {}

        // 4. Live GPS current position
        try {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (isMounted && current && current.coords) {
            const coords = {
              latitude: current.coords.latitude,
              longitude: current.coords.longitude,
            };
            setUserCoords(coords);
            userCoordsRef.current = coords;
            postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords });
          }
        } catch (posErr) {
          console.log('[MapScreen] Live GPS fix delayed, using last known or municipal center:', posErr);
        }

        // 5. Continuous position watcher
        try {
          subscriber = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 2500,
              distanceInterval: 2,
            },
            (loc) => {
              if (isMounted && loc && loc.coords) {
                const coords = {
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                };
                setUserCoords(coords);
                userCoordsRef.current = coords;
                postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords });
              }
            }
          );
        } catch (watchErr) {
          console.log('[MapScreen] Watch position setup:', watchErr);
        }
      } catch (err) {
        console.warn('Location initialization error:', err);
      }
    }

    initLocation();

    return () => {
      isMounted = false;
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
        targetHub,
        isOffline
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
    [postMessageToWeb, isOffline]
  );

  const handleTriggerEvacuate = useCallback(() => {
    const origin = userCoordsRef.current || userCoords || MUNICIPAL_CENTER;
    const title = 'Your Location';
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

      // Open emergency report form immediately so resident can provide Details, Priority, Landmark
      if (onOpenReportModal) {
        onOpenReportModal();
      }
    } catch (err) {
      console.warn('[MapScreen] Error marking not safe:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [userCoords, handleTriggerEvacuate, onOpenReportModal]);

  useEffect(() => {
    if (initialAutoRoute && mapLoaded) {
      handleTriggerEvacuate();
      if (onClearAutoRoute) {
        onClearAutoRoute();
      }
    }
  }, [initialAutoRoute, mapLoaded, handleTriggerEvacuate, onClearAutoRoute]);

  // Automatically activate evacuation route immediately when admin triggers an alarm
  useEffect(() => {
    if (activeDisaster && mapLoaded) {
      handleTriggerEvacuate();
    }
  }, [activeDisaster, mapLoaded, handleTriggerEvacuate]);

  // Auto-activate offline municipal safe route when signal is lost (Ahmad's requirement)
  useEffect(() => {
    if (isOffline && mapLoaded && !activeEvacRoute) {
      handleTriggerEvacuate();
    }
  }, [isOffline, mapLoaded, activeEvacRoute, handleTriggerEvacuate]);

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

  const handleRecenterUser = async () => {
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (current && current.coords) {
        const coords = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };
        setUserCoords(coords);
        userCoordsRef.current = coords;
        postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords, recenter: true });
        return;
      }
    } catch {}

    const target = userCoordsRef.current || userCoords || MUNICIPAL_CENTER;
    postMessageToWeb({ type: 'RECENTER_USER', coords: target });
  };

  const handleWebMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_READY') {
        setMapLoaded(true);
        const target = userCoordsRef.current || userCoords || MUNICIPAL_CENTER;
        postMessageToWeb({ type: 'UPDATE_USER_LOCATION', coords: target });
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
    html, body, #map {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background-color: #0f172a;
      background-image: 
        radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%),
        linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
      background-size: 100% 100%, 28px 28px, 28px 28px;
    }
    .leaflet-tile-pane { background: transparent; }
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
    .user-pulse-container {
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-pulse-radar {
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.25);
      border: 2px solid rgba(37, 99, 235, 0.8);
      animation: user-radar 2s infinite ease-out;
    }
    .user-pulse-core {
      position: absolute;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #2563eb;
      border: 3px solid #ffffff;
      box-shadow: 0 0 10px rgba(37,99,235,0.85);
      z-index: 2;
    }
    .user-label {
      position: absolute;
      bottom: -13px;
      background: #0f172a;
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 4px;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      z-index: 3;
      border: 1px solid rgba(255,255,255,0.2);
    }
    @keyframes user-radar {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
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

    // Handle offline tile failures gracefully without broken image badges
    osmLayer.on('tileerror', function() {});
    satLayer.on('tileerror', function() {});

    const USER_INIT_POS = [${userCoords ? userCoords.latitude : MUNICIPAL_CENTER.latitude}, ${userCoords ? userCoords.longitude : MUNICIPAL_CENTER.longitude}];
    const createUserIcon = function() {
      return L.divIcon({
        className: '',
        html: '<div class="user-pulse-container"><div class="user-pulse-radar"></div><div class="user-pulse-core"></div><div class="user-label">You</div></div>',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });
    };
    let userMarker = L.marker(USER_INIT_POS, { icon: createUserIcon(), zIndexOffset: 2000 }).addTo(map);
    userMarker.bindPopup('<b>📍 Your Location</b><br/><span style="color:#2563eb;font-weight:600;">Active GPS</span>');
    let baseRoadLayer = L.layerGroup().addTo(map);
    let bldgLayer = L.layerGroup().addTo(map);
    let zoneLayer = L.layerGroup().addTo(map);
    let supplyLayer = L.layerGroup().addTo(map);
    let dynamicRouteGroup = L.layerGroup().addTo(map);

    // Guaranteed Offline Municipal Road Corridors (Rendered directly via local vectors)
    const MUNICIPAL_STREETS = [
      // Rizal Ave North-to-South Spine
      [[7.100767, 124.824077], [7.1005898, 124.823930], [7.100450, 124.823900], [7.100250, 124.823850], [7.100077, 124.823690], [7.099850, 124.823720]],
      // East Municipal Corridor (MDRRMO, BFP, Police, Market East)
      [[7.100458, 124.824615], [7.100423, 124.824379], [7.100282, 124.824365], [7.100146, 124.824301], [7.099643, 124.824357]],
      // Hall Street Connector
      [[7.100767, 124.824077], [7.100636, 124.824271], [7.100458, 124.824615]],
      // Mid Crossing Connector
      [[7.100450, 124.823900], [7.100423, 124.824379]],
      // Market Crossing to Civic Center
      [[7.100250, 124.823850], [7.100282, 124.824365], [7.100146, 124.824301]],
      // South Plaza Crossing to South Junction
      [[7.100077, 124.823690], [7.099850, 124.823720], [7.099643, 124.824357]]
    ];

    MUNICIPAL_STREETS.forEach(function(coords) {
      L.polyline(coords, { color: '#334155', weight: 7, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(baseRoadLayer);
      L.polyline(coords, { color: '#64748b', weight: 2.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(baseRoadLayer);
    });

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
          userMarker = L.marker(userPos, { icon: createUserIcon(), zIndexOffset: 2000 }).addTo(map);
          userMarker.bindPopup('<b>📍 Your Location</b><br/><span style="color:#2563eb;font-weight:600;">Active GPS</span>');
        } else {
          userMarker.setLatLng(userPos);
        }
        if (data.recenter) {
          map.setView(userPos, 18, { animate: true });
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

      {/* 1. TOP EMERGENCY SIREN BANNER FLOATING AT THE TOP OF THE MAP */}
      {activeDisaster && (
        <View style={styles.topSirenBanner}>
          <View style={styles.topSirenLeft}>
            <View style={styles.topSirenPulseDot} />
            <View style={styles.topSirenTextGroup}>
              <Text style={styles.topSirenTitle}>
                🚨 {String(activeDisaster.type || 'EMERGENCY').toUpperCase()} ALERT
              </Text>
              <Text style={styles.topSirenSub} numberOfLines={1}>
                {activeDisaster.message || 'Evacuation route activated to nearest safe hub'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.silenceSirenBtn}
            onPress={() => soundService.stopEmergencySiren()}
            activeOpacity={0.8}
            accessibilityLabel="Silence siren"
          >
            <Text style={styles.silenceSirenBtnText}>Silence Siren 🔕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. TOP BAR CONTROLS */}
      <View style={[styles.topBar, activeDisaster && styles.topBarWithSiren]}>
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

          {onOpenReportModal && (
            <TouchableOpacity
              style={[styles.circleBtn, styles.sosQuickBtn]}
              onPress={onOpenReportModal}
              activeOpacity={0.8}
              accessibilityLabel="Report Emergency Incident"
            >
              <Text style={styles.sosQuickBtnText}>🚨</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. OFFLINE DISASTER MODE BANNER */}
      {isOffline && (
        <View style={[styles.offlineBanner, activeDisaster && styles.offlineBannerWithSiren]}>
          <View style={styles.offlineBannerContent}>
            <Text style={styles.offlineBannerIcon}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.offlineBannerTitle}>OFFLINE DISASTER MODE ACTIVE</Text>
              <Text style={styles.offlineBannerSub}>
                Cellular/Wi-Fi lost. Routing along Kabacan municipal road network.
              </Text>
            </View>
          </View>
        </View>
      )}

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
              Follow the green line street directly to the designated safe zone!
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

            {/* Dual Status Action Buttons: I'M NOT SAFE and I'M SAFE */}
            <View style={[styles.statusButtonGroup, { marginTop: 10 }]}>
              {/* I'M NOT SAFE BUTTON */}
              <TouchableOpacity
                style={[
                  styles.statusActionBtn,
                  styles.btnDanger,
                  residentStatus === 'DANGER' && styles.btnDangerActive,
                ]}
                onPress={handleMarkNotSafe}
                disabled={isUpdatingStatus}
                activeOpacity={0.8}
                accessibilityLabel="Declare emergency SOS and report"
              >
                <View style={styles.btnTextCol}>
                  <Text style={styles.btnDangerTitle}>I'M NOT SAFE</Text>
                  <Text style={styles.btnDangerSubtitle}>SOS & Report</Text>
                </View>
              </TouchableOpacity>

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
            </View>
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
  topSirenBanner: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 999,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  topSirenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    paddingRight: 10,
  },
  topSirenPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  topSirenTextGroup: {
    flex: 1,
  },
  topSirenTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topSirenSub: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 11,
    marginTop: 1,
  },
  silenceSirenBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  silenceSirenBtnText: {
    color: '#DC2626',
    fontSize: 11.5,
    fontWeight: '800',
  },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 900,
  },
  topBarWithSiren: {
    top: 76,
  },
  offlineBannerWithSiren: {
    top: 126,
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
    color: '#065F46',
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginBottom: 8,
  },
  sosQuickBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
    borderWidth: 1.5,
  },
  sosQuickBtnText: {
    fontSize: 13,
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
  offlineBanner: {
    position: 'absolute',
    top: 54,
    left: 14,
    right: 14,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  offlineBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  offlineBannerIcon: {
    fontSize: 18,
    color: '#D97706',
  },
  offlineBannerTitle: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  offlineBannerSub: {
    color: '#B45309',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
});
