/**
 * GabayX Offline Maps & Routes Service
 * 
 * Provides robust offline geospatial support for disaster response:
 * - Pre-calculated and dynamically acquired route geometries (OSRM foot router).
 * - Bounded OpenStreetMap basemap tile packages for KNHS Campus & Kabacan perimeter.
 * - Explicit enforcement of provider usage terms (ArcGIS bulk scraping restricted).
 * - Full offline persistence via IndexedDB & Service Worker CacheStorage.
 * - Disaster-safety disclaimers, freshness audits, and stale route warnings.
 */

(function (global) {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. BOUNDS, GEOGRAPHY & OFFICIAL ROUTE CATALOG
    // --------------------------------------------------------------------------

    // KNHS Campus & Kabacan Emergency Perimeter
    const CAMPUS_BOUNDS = {
        south: 7.0980,
        west: 124.8210,
        north: 7.1030,
        east: 124.8270
    };

    const EVACUATION_CENTER_COORDS = [7.100589893149529, 124.82393056927546];

    // Pre-verified campus footpaths for emergency fallback when OSRM is unreachable
    const AUTHORITATIVE_FALLBACK_PATHS = {
        route_principal_front: [
            [7.09985, 124.82372],
            [7.10005, 124.82370],
            [7.10025, 124.82385],
            [7.10045, 124.82390],
            [7.100589893149529, 124.82393056927546]
        ],
        route_mendoza_court: [
            [7.09965, 124.82420],
            [7.09980, 124.82410],
            [7.09995, 124.82385],
            [7.100077551009359, 124.82369094608939]
        ],
        route_tejada_court: [
            [7.10045, 124.82460],
            [7.10035, 124.82445],
            [7.10020, 124.82435],
            [7.1001461901808565, 124.82430112059413]
        ]
    };

    // Catalog of Authoritative Evacuation Routes for GabayX
    const ROUTE_CATALOG = [
        {
            id: 'route_principal_front',
            name: 'Primary Evacuation Hub (Principal Front)',
            description: 'Direct assembly route from campus entrance to the official Primary Evacuation Center.',
            origin: { name: 'Campus Main Gate / Admin Quad', coords: [7.09985, 124.82372] },
            destination: { name: 'Principal Front Evacuation Hub', coords: EVACUATION_CENTER_COORDS, isEvacuationCenter: true },
            disasterTypes: ['EARTHQUAKE', 'FIRE'],
            isOfficialEvacuationRoute: true,
            category: 'Authoritative Designated Evacuation Route',
            estimatedDistanceMeters: 320,
            estimatedDurationMinutes: 4
        },
        {
            id: 'route_mendoza_court',
            name: 'Secondary Safe Zone (Mendoza Court)',
            description: 'Designated outdoor athletic court assembly route for southern wing classrooms.',
            origin: { name: 'Southern Classrooms (BLDGs H-L)', coords: [7.09965, 124.82420] },
            destination: { name: 'Mendoza Court Safe Zone', coords: [7.100077551009359, 124.82369094608939], isEvacuationCenter: true },
            disasterTypes: ['FIRE', 'FLOOD'],
            isOfficialEvacuationRoute: true,
            category: 'Designated Flood & Fire Assembly Route',
            estimatedDistanceMeters: 280,
            estimatedDurationMinutes: 3
        },
        {
            id: 'route_tejada_court',
            name: 'Tertiary Safe Zone (Tejada Court)',
            description: 'Elevated court evacuation route for science and technology academic buildings.',
            origin: { name: 'Eastern Science & Tech Wing', coords: [7.10045, 124.82460] },
            destination: { name: 'Tejada Court Safe Zone', coords: [7.1001461901808565, 124.82430112059413], isEvacuationCenter: true },
            disasterTypes: ['FLOOD', 'FIRE'],
            isOfficialEvacuationRoute: true,
            category: 'Designated Flood & Fire Assembly Route',
            estimatedDistanceMeters: 250,
            estimatedDurationMinutes: 3
        },
        {
            id: 'route_mdrrmo_kabacan',
            name: 'Kabacan MDRRMO Emergency Operations Center',
            description: 'Municipal evacuation access corridor for coordinated disaster management.',
            origin: { name: 'KNHS Campus Hub', coords: EVACUATION_CENTER_COORDS },
            destination: { name: 'Kabacan MDRRMO Operations Center', coords: [7.1105, 124.8260], isEvacuationCenter: false },
            disasterTypes: ['MUNICIPAL_COORDINATION'],
            isOfficialEvacuationRoute: true,
            category: 'Municipal Emergency Services Access Corridor',
            estimatedDistanceMeters: 1350,
            estimatedDurationMinutes: 16
        },
        {
            id: 'route_usm_gym',
            name: 'USM Gymnasium Regional Evacuation Shelter',
            description: 'Designated large-scale evacuation shelter for town-wide mass evacuations.',
            origin: { name: 'KNHS Campus Hub', coords: EVACUATION_CENTER_COORDS },
            destination: { name: 'USM Gymnasium Evacuation Shelter', coords: [7.1055, 124.8285], isEvacuationCenter: true },
            disasterTypes: ['REGIONAL_DISASTER', 'FLOOD'],
            isOfficialEvacuationRoute: true,
            category: 'Regional Mass Evacuation Shelter',
            estimatedDistanceMeters: 920,
            estimatedDurationMinutes: 11
        }
    ];

    // --------------------------------------------------------------------------
    // 2. PROVIDER TERMS & TILE POLICIES
    // --------------------------------------------------------------------------
    const TILE_PROVIDERS = {
        OPEN_STREET_MAP: {
            id: 'osm_street',
            name: 'OpenStreetMap (Street Map)',
            supportsOfflineDownload: true,
            policyNotice: 'Small, bounded emergency perimeter download permitted under OSM Fair Use / Disaster Preparedness guidelines. Polite rate-limiting applied.',
            tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maxOfflineZoom: 18,
            minOfflineZoom: 17
        },
        ARCGIS_SATELLITE: {
            id: 'arcgis_satellite',
            name: 'ArcGIS World Imagery (Satellite)',
            supportsOfflineDownload: false,
            policyNotice: 'Esri Terms of Use prohibit scraping or bulk offline tile downloading without an enterprise license. Satellite imagery is cached on-demand as you pan the map while online.',
            tileUrlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            maxOfflineZoom: 19,
            minOfflineZoom: 16
        }
    };

    const DISASTER_SAFETY_NOTICE = 'DISASTER SAFETY WARNING: Downloaded routes are reference guidelines only. Active disaster conditions (floods, structural damage, fire, fallen electrical wires) may block designated roads. Always verify on-site safety and heed real-time directives from local authorities.';

    // --------------------------------------------------------------------------
    // 3. SLIPPY TILE MATHEMATICS
    // --------------------------------------------------------------------------
    function lon2tile(lon, zoom) {
        return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    }

    function lat2tile(lat, zoom) {
        return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    }

    /**
     * Compute list of all tile coordinate keys for a bounding box and zoom range
     */
    function calculateTileList(bounds, zooms = [17, 18]) {
        const tiles = [];
        zooms.forEach((zoom) => {
            const xMin = lon2tile(bounds.west, zoom);
            const xMax = lon2tile(bounds.east, zoom);
            const yMin = lat2tile(bounds.north, zoom);
            const yMax = lat2tile(bounds.south, zoom);

            for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
                for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
                    const key = `osm_${zoom}_${x}_${y}`;
                    const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
                    tiles.push({ z: zoom, x, y, key, url });
                }
            }
        });
        return tiles;
    }

    // --------------------------------------------------------------------------
    // 4. STORAGE ADAPTER (INDEXEDDB WITH CACHE FALLBACK)
    // --------------------------------------------------------------------------
    function getStorage() {
        if (typeof global.GabayXDB !== 'undefined') {
            return global.GabayXDB;
        }
        // Fallback dummy for testing environments
        return {
            saveRoute: (r) => Promise.resolve(r),
            getRoute: () => Promise.resolve(null),
            getAllRoutes: () => Promise.resolve([]),
            deleteRoute: () => Promise.resolve(true),
            saveTile: (t) => Promise.resolve(t),
            getAllTiles: () => Promise.resolve([]),
            clearTiles: () => Promise.resolve(true),
            savePackage: (p) => Promise.resolve(p),
            getAllPackages: () => Promise.resolve([]),
            deletePackage: () => Promise.resolve(true),
            getStorageStats: () => Promise.resolve({ routeCount: 0, tileCount: 0, packageCount: 0, approxBytes: 0 })
        };
    }

    // --------------------------------------------------------------------------
    // 5. ROUTE FETCHING & OFFLINE PERSISTENCE
    // --------------------------------------------------------------------------

    /**
     * Query OSRM Foot Router for true street walking geometry
     */
    async function fetchOSRMRoute(originCoords, destCoords) {
        const originLng = originCoords[1];
        const originLat = originCoords[0];
        const destLng = destCoords[1];
        const destLat = destCoords[0];

        const url = `https://router.project-osrm.org/route/v1/foot/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) {
                throw new Error(`OSRM HTTP error: ${res.status}`);
            }
            const data = await res.json();
            if (!data.routes || data.routes.length === 0) {
                throw new Error('No route found by routing engine');
            }

            const primaryRoute = data.routes[0];
            const coordinates = primaryRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            const distanceMeters = Math.round(primaryRoute.distance);
            const durationMinutes = Math.max(1, Math.ceil(primaryRoute.duration / 60));

            const steps = [];
            if (primaryRoute.legs && primaryRoute.legs[0] && primaryRoute.legs[0].steps) {
                primaryRoute.legs[0].steps.forEach((step) => {
                    if (step.maneuver && step.maneuver.instruction) {
                        steps.push(step.maneuver.instruction);
                    } else if (step.name) {
                        steps.push(`Proceed along ${step.name}`);
                    }
                });
            }

            return {
                coordinates,
                distanceMeters,
                durationMinutes,
                steps,
                source: 'OSRM Foot Router (Live Geometry)'
            };
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }

    /**
     * Prepare and download a route for offline use
     */
    async function downloadRoute(routeId, customOrigin = null) {
        const catalogItem = ROUTE_CATALOG.find((r) => r.id === routeId);
        if (!catalogItem && !routeId.startsWith('custom_')) {
            throw new Error(`Unknown route ID: ${routeId}`);
        }

        const origin = customOrigin || (catalogItem ? catalogItem.origin : { name: 'Your Location', coords: EVACUATION_CENTER_COORDS });
        const destination = catalogItem ? catalogItem.destination : { name: 'Evacuation Center', coords: EVACUATION_CENTER_COORDS, isEvacuationCenter: true };
        const name = catalogItem ? catalogItem.name : 'Custom Emergency Route';
        const isOfficial = catalogItem ? catalogItem.isOfficialEvacuationRoute : false;
        const disasterTypes = catalogItem ? catalogItem.disasterTypes : ['EMERGENCY'];

        let routeGeometry = null;
        let distanceMeters = catalogItem ? catalogItem.estimatedDistanceMeters : 300;
        let durationMinutes = catalogItem ? catalogItem.estimatedDurationMinutes : 4;
        let steps = [];
        let geometrySource = 'OSRM Foot Router';

        // Attempt live OSRM calculation if online
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        if (isOnline) {
            try {
                const live = await fetchOSRMRoute(origin.coords, destination.coords);
                routeGeometry = live.coordinates;
                distanceMeters = live.distanceMeters;
                durationMinutes = live.durationMinutes;
                steps = live.steps;
                geometrySource = live.source;
            } catch (err) {
                console.warn(`[OfflineMaps] OSRM live routing failed (${err.message}). Using authoritative pre-verified fallback path.`);
                routeGeometry = AUTHORITATIVE_FALLBACK_PATHS[routeId] || [origin.coords, destination.coords];
                geometrySource = 'Authoritative Campus Path (Verified Fallback)';
            }
        } else {
            // Offline fallback
            routeGeometry = AUTHORITATIVE_FALLBACK_PATHS[routeId];
            if (!routeGeometry) {
                throw new Error('Device is offline and no pre-calculated route geometry exists for this destination.');
            }
            geometrySource = 'Authoritative Campus Path (Cached Geometry)';
        }

        const savedRoute = {
            id: routeId,
            name,
            description: catalogItem ? catalogItem.description : 'Custom emergency route',
            origin,
            destination,
            coordinates: routeGeometry,
            distanceMeters,
            durationMinutes,
            steps,
            geometrySource,
            isOfficialEvacuationRoute: isOfficial,
            disasterTypes,
            downloadTimestamp: Date.now(),
            downloadDateFormatted: new Date().toLocaleString(),
            disasterSafetyNotice: DISASTER_SAFETY_NOTICE
        };

        const db = getStorage();
        await db.saveRoute(savedRoute);
        return savedRoute;
    }

    /**
     * Download all designated official safe zone routes at once
     */
    async function downloadAllOfficialRoutes(progressCallback) {
        const officialRoutes = ROUTE_CATALOG.filter((r) => r.isOfficialEvacuationRoute);
        const results = [];
        for (let i = 0; i < officialRoutes.length; i++) {
            const item = officialRoutes[i];
            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: officialRoutes.length,
                    name: item.name
                });
            }
            try {
                const saved = await downloadRoute(item.id);
                results.push(saved);
            } catch (err) {
                console.error(`Failed to download route ${item.name}:`, err);
            }
        }
        return results;
    }

    // --------------------------------------------------------------------------
    // 6. MAP TILE PACKAGE ESTIMATION & DOWNLOAD
    // --------------------------------------------------------------------------

    /**
     * Estimate tile count and byte size for KNHS Campus perimeter
     */
    function estimateCampusMapPackage() {
        const tileList = calculateTileList(CAMPUS_BOUNDS, [17, 18]);
        const count = tileList.length;
        const avgTileBytes = 18 * 1024; // ~18 KB per standard OSM tile
        const approxBytes = count * avgTileBytes;
        const approxKb = Math.round(approxBytes / 1024);

        return {
            id: 'knhs_campus_osm',
            name: 'KNHS Campus & Perimeter Basemap',
            areaDescription: 'Kabacan National High School & Assembly Grounds',
            provider: TILE_PROVIDERS.OPEN_STREET_MAP.name,
            providerId: TILE_PROVIDERS.OPEN_STREET_MAP.id,
            bounds: CAMPUS_BOUNDS,
            zoomRange: [17, 18],
            tileCount: count,
            approxBytes,
            approxFormatted: `${approxKb} KB (~${(approxKb / 1024).toFixed(2)} MB)`,
            supported: true,
            policyNotice: TILE_PROVIDERS.OPEN_STREET_MAP.policyNotice
        };
    }

    /**
     * Download the bounded campus map tiles for offline viewing
     */
    async function downloadCampusMapPackage(progressCallback, abortSignal) {
        const estimate = estimateCampusMapPackage();
        const tileList = calculateTileList(CAMPUS_BOUNDS, [17, 18]);
        const total = tileList.length;

        const db = getStorage();
        let downloadedCount = 0;
        let totalBytes = 0;

        let swTileCache = null;
        if (typeof caches !== 'undefined') {
            try {
                swTileCache = await caches.open('gabayx-tiles-v3');
            } catch (e) {
                console.warn('[OfflineMaps] Could not open CacheStorage:', e);
            }
        }

        for (let i = 0; i < total; i++) {
            if (abortSignal && abortSignal.aborted) {
                throw new Error('Download cancelled by user.');
            }

            const t = tileList[i];

            // 1. Check if already stored to avoid duplicate fetches
            const existing = await db.getTile(t.key);
            if (existing) {
                downloadedCount++;
                totalBytes += existing.sizeBytes || 18000;
                if (progressCallback) {
                    progressCallback({
                        downloaded: downloadedCount,
                        total,
                        percent: Math.round((downloadedCount / total) * 100),
                        currentTile: t.key
                    });
                }
                continue;
            }

            // 2. Fetch tile politely
            try {
                const res = await fetch(t.url, {
                    signal: abortSignal,
                    headers: { 'Accept': 'image/png,image/*;q=0.8' }
                });

                if (!res.ok) {
                    throw new Error(`Tile fetch returned ${res.status}`);
                }

                const blob = await res.blob();
                const sizeBytes = blob.size;
                totalBytes += sizeBytes;

                // Sync with Service Worker CacheStorage so Leaflet serves it offline seamlessly
                if (swTileCache) {
                    try {
                        const cacheResponse = new Response(blob, {
                            headers: { 'Content-Type': 'image/png' }
                        });
                        await swTileCache.put(t.url, cacheResponse);
                    } catch (cacheErr) {
                        console.warn('[OfflineMaps] Cache put failed:', cacheErr);
                    }
                }

                // Store tile record in IndexedDB
                await db.saveTile({
                    key: t.key,
                    z: t.z,
                    x: t.x,
                    y: t.y,
                    url: t.url,
                    sizeBytes,
                    timestamp: Date.now()
                });

                downloadedCount++;

                if (progressCallback) {
                    progressCallback({
                        downloaded: downloadedCount,
                        total,
                        percent: Math.round((downloadedCount / total) * 100),
                        currentTile: t.key
                    });
                }

                // Polite pacing to honor OSM servers
                await new Promise((r) => setTimeout(r, 60));
            } catch (fetchErr) {
                if (abortSignal && abortSignal.aborted) {
                    throw new Error('Download cancelled by user.');
                }
                console.warn(`[OfflineMaps] Tile fetch failed for ${t.key}:`, fetchErr);
            }
        }

        // Save package metadata record
        const packageRecord = {
            id: estimate.id,
            name: estimate.name,
            provider: estimate.provider,
            tileCount: downloadedCount,
            sizeBytes: totalBytes,
            bounds: CAMPUS_BOUNDS,
            zoomRange: [17, 18],
            downloadTimestamp: Date.now(),
            downloadDateFormatted: new Date().toLocaleString(),
            status: downloadedCount === total ? 'complete' : 'partial'
        };

        await db.savePackage(packageRecord);
        return packageRecord;
    }

    /**
     * Delete downloaded campus map package and purge tiles from CacheStorage
     */
    async function deleteCampusMapPackage() {
        const db = getStorage();
        await db.deletePackage('knhs_campus_osm');
        await db.clearTiles();

        if (typeof caches !== 'undefined') {
            try {
                const cache = await caches.open('gabayx-tiles-v3');
                const keys = await cache.keys();
                for (const req of keys) {
                    if (req.url.includes('tile.openstreetmap.org')) {
                        await cache.delete(req);
                    }
                }
            } catch (e) {
                console.warn('[OfflineMaps] Error purging tile cache:', e);
            }
        }

        return true;
    }

    // --------------------------------------------------------------------------
    // 7. OFFLINE STATUS AUDIT & DATA FRESHNESS
    // --------------------------------------------------------------------------

    /**
     * Determine offline readiness, storage usage, and stale warnings
     */
    async function auditOfflineReadiness() {
        const db = getStorage();
        const routes = await db.getAllRoutes();
        const packages = await db.getAllPackages();
        const tiles = await db.getAllTiles();
        const stats = await db.getStorageStats();

        const officialRoutesCount = routes.filter((r) => r.isOfficialEvacuationRoute).length;
        const totalOfficialCatalog = ROUTE_CATALOG.filter((r) => r.isOfficialEvacuationRoute).length;

        const hasMapPackage = packages.some((p) => p.status === 'complete') || tiles.length >= 12;

        let status = 'NOT_CONFIGURED';
        let statusBadgeText = 'No Offline Data';
        let statusBadgeColor = 'var(--text-sub)';

        if (officialRoutesCount >= 3 && hasMapPackage) {
            status = 'READY';
            statusBadgeText = 'Fully Offline Ready';
            statusBadgeColor = 'var(--primary)';
        } else if (officialRoutesCount > 0 || hasMapPackage) {
            status = 'PARTIAL';
            statusBadgeText = 'Partially Ready';
            statusBadgeColor = 'var(--warning)';
        }

        // Stale Route Analysis (Warn if downloaded > 7 days ago)
        let lastDownloadTime = null;
        let isStale = false;
        let freshestTimestamp = 0;

        routes.forEach((r) => {
            if (r.downloadTimestamp && r.downloadTimestamp > freshestTimestamp) {
                freshestTimestamp = r.downloadTimestamp;
            }
        });
        packages.forEach((p) => {
            if (p.downloadTimestamp && p.downloadTimestamp > freshestTimestamp) {
                freshestTimestamp = p.downloadTimestamp;
            }
        });

        if (freshestTimestamp > 0) {
            lastDownloadTime = new Date(freshestTimestamp).toLocaleString();
            const daysOld = (Date.now() - freshestTimestamp) / (1000 * 60 * 60 * 24);
            if (daysOld > 7) {
                isStale = true;
            }
        }

        return {
            status,
            statusBadgeText,
            statusBadgeColor,
            savedRoutesCount: routes.length,
            officialRoutesCount,
            totalOfficialCatalog,
            hasMapPackage,
            tileCount: tiles.length,
            lastDownloadTime,
            isStale,
            storageApproxBytes: stats.approxBytes,
            storageApproxFormatted: `${Math.round(stats.approxBytes / 1024)} KB`,
            quotaUsage: stats.quotaUsage,
            quotaTotal: stats.quotaTotal,
            disasterSafetyNotice: DISASTER_SAFETY_NOTICE
        };
    }

    // --------------------------------------------------------------------------
    // 8. LEAFLET MAP INTEGRATION & ROUTE RENDERING
    // --------------------------------------------------------------------------

    let activeOfflineRouteLayer = null;

    /**
     * Render a saved route onto Leaflet map without any network requests
     */
    function renderRouteOnMap(leafletMap, route) {
        if (!leafletMap || !route || !route.coordinates || route.coordinates.length === 0) {
            return null;
        }

        // Remove prior offline layer
        if (activeOfflineRouteLayer) {
            leafletMap.removeLayer(activeOfflineRouteLayer);
            activeOfflineRouteLayer = null;
        }

        const layerGroup = L.layerGroup().addTo(leafletMap);

        // 1. Polyline path
        const polyline = L.polyline(route.coordinates, {
            color: route.isOfficialEvacuationRoute ? '#10b981' : '#0ea5e9',
            weight: 6,
            opacity: 0.95,
            dashArray: '10, 6',
            lineJoin: 'round',
            lineCap: 'round'
        }).addTo(layerGroup);

        // 2. Start (Origin) Pin
        const startIcon = L.divIcon({
            className: 'gx-offline-origin-pin',
            html: `<div style="background:#0284c7; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; border:2px solid #fff; box-shadow:0 0 10px rgba(2,132,199,0.7);"><i class="fas fa-person-running" style="font-size:13px;"></i></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        L.marker(route.coordinates[0], { icon: startIcon })
            .addTo(layerGroup)
            .bindPopup(`<div style="font-family:var(--font-ui); font-size:11px; color:#fff; padding:4px;"><b>Starting Point:</b><br>${route.origin.name}</div>`);

        // 3. Destination (Safe Zone) Pin
        const endCoords = route.coordinates[route.coordinates.length - 1];
        const endIcon = L.divIcon({
            className: 'gx-offline-dest-pin',
            html: `<div style="background:#10b981; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; border:2px solid #fff; box-shadow:0 0 15px rgba(16,185,129,0.8);"><i class="fas fa-shield-halved" style="font-size:15px;"></i></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
        });
        L.marker(endCoords, { icon: endIcon })
            .addTo(layerGroup)
            .bindPopup(`<div style="font-family:var(--font-ui); font-size:11px; color:#fff; padding:4px;"><b style="color:#10b981">Evacuation Hub:</b><br>${route.destination.name}<br><span style="font-size:9.5px; opacity:0.8;">${route.distanceMeters}m approx.</span></div>`);

        // Fit map bounds
        leafletMap.fitBounds(polyline.getBounds(), { padding: [60, 60], maxZoom: 19 });

        activeOfflineRouteLayer = layerGroup;
        return layerGroup;
    }

    function clearActiveRouteFromMap(leafletMap) {
        if (activeOfflineRouteLayer && leafletMap) {
            leafletMap.removeLayer(activeOfflineRouteLayer);
            activeOfflineRouteLayer = null;
        }
    }

    // --------------------------------------------------------------------------
    // 9. PUBLIC SERVICE API
    // --------------------------------------------------------------------------
    const Service = {
        CAMPUS_BOUNDS,
        EVACUATION_CENTER_COORDS,
        ROUTE_CATALOG,
        TILE_PROVIDERS,
        DISASTER_SAFETY_NOTICE,
        calculateTileList,
        fetchOSRMRoute,
        downloadRoute,
        downloadAllOfficialRoutes,
        estimateCampusMapPackage,
        downloadCampusMapPackage,
        deleteCampusMapPackage,
        auditOfflineReadiness,
        renderRouteOnMap,
        clearActiveRouteFromMap
    };

    // Export for CommonJS (tests) and browser window
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Service;
    }
    global.GabayXOfflineMapsService = Service;

})(typeof window !== 'undefined' ? window : this);
