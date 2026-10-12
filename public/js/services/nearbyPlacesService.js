/**
 * GabayX Nearby Places Service
 * 
 * Geospatial discovery service for disaster-response applications.
 * Queries nearby buildings, medical clinics, schools, government offices, and
 * evacuation facilities via the OpenStreetMap Overpass API, with local offline
 * fallbacks for designated campus safe zones and emergency centers.
 * 
 * Strict Disaster-Response Safety Rules:
 * - Only authoritative, designated evacuation centers are classified as VERIFIED.
 * - Schools and public buildings are NEVER classified as verified evacuation centers.
 * - Distances are strictly straight-line approximations and never represented as route times.
 */

(function (global) {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. CONFIGURATION & DISASTER SAFETY TAXONOMY
    // --------------------------------------------------------------------------
    const CONFIG = {
        defaultRadius: 2000, // 2 kilometers (configurable)
        availableRadii: [500, 1000, 2000, 5000],
        timeoutMs: 9000,
        endpoints: [
            'https://overpass-api.de/api/interpreter',
            'https://lz4.overpass-api.de/api/interpreter'
        ],
        cacheDurationMs: 5 * 60 * 1000 // 5 minutes cache
    };

    const CLASSIFICATIONS = {
        VERIFIED_EVACUATION: {
            code: 'VERIFIED_EVACUATION',
            categoryKey: 'safe_zones',
            label: 'Verified Evacuation Hub',
            badgeClass: 'gx-badge-verified',
            badgeColor: '#10b981',
            icon: 'fa-shield-halved',
            pinColor: '#10b981',
            statusText: 'Authoritative designated evacuation assembly point.',
            isVerifiedSafe: true
        },
        EMERGENCY_SERVICE: {
            code: 'EMERGENCY_SERVICE',
            categoryKey: 'emergency_services',
            label: 'Emergency Service Facility',
            badgeClass: 'gx-badge-emergency',
            badgeColor: '#ef4444',
            icon: 'fa-kit-medical',
            pinColor: '#ef4444',
            statusText: 'First responder / medical facility. Structural integrity during this disaster is unverified.',
            isVerifiedSafe: false
        },
        OTHER_MAPPED_PLACE: {
            code: 'OTHER_MAPPED_PLACE',
            categoryKey: 'other_places',
            label: 'Unverified Structure',
            badgeClass: 'gx-badge-unverified',
            badgeColor: '#64748b',
            icon: 'fa-building',
            pinColor: '#0284c7',
            statusText: 'Not an official evacuation center. Do not assume structure is safe, open, or undamaged.',
            isVerifiedSafe: false
        }
    };

    // In-memory query cache: key -> { timestamp, data }
    const memoryCache = new Map();

    // --------------------------------------------------------------------------
    // 2. DISTANCE CALCULATIONS (Approximate Straight-Line)
    // --------------------------------------------------------------------------
    /**
     * Calculate approximate straight-line distance between two GPS coordinates using Haversine
     * @param {number} lat1
     * @param {number} lon1
     * @param {number} lat2
     * @param {number} lon2
     * @returns {number} Distance in meters
     */
    function calculateDistance(lat1, lon1, lat2, lon2) {
        if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
            return 0;
        }
        const R = 6371000; // Earth's radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c);
    }

    /**
     * Format distance according to requirements:
     * - In meters (< 1000m) e.g. "350 m"
     * - In kilometers (>= 1000m) e.g. "1.4 km"
     * @param {number} meters
     * @returns {string} Formatted distance
     */
    function formatDistance(meters) {
        if (meters < 1000) {
            return `${Math.round(meters)} m`;
        }
        return `${(meters / 1000).toFixed(1)} km`;
    }

    // --------------------------------------------------------------------------
    // 3. CLASSIFICATION & DESCRIPTIVE LABELING
    // --------------------------------------------------------------------------
    /**
     * Classify a mapped place according to disaster-response standards
     * @param {Object} tags OSM tags
     * @param {string} name Place name
     * @returns {Object} Classification metadata
     */
    function classifyPlace(tags = {}, name = '') {
        const amenity = (tags.amenity || '').toLowerCase();
        const emergency = (tags.emergency || '').toLowerCase();
        const office = (tags.office || '').toLowerCase();
        const building = (tags.building || '').toLowerCase();
        const upperName = (name || '').toUpperCase();

        // A. Authoritative Verified Safe Zones
        const isOfficialSafeZone =
            emergency === 'assembly_point' ||
            emergency === 'evacuation_centre' ||
            tags['evacuation_center'] === 'yes' ||
            upperName.includes('PRINCIPAL FRONT') ||
            upperName.includes('MENDOZA COURT') ||
            upperName.includes('TEJADA COURT') ||
            upperName.includes('SAFE ZONE');

        if (isOfficialSafeZone) {
            return {
                ...CLASSIFICATIONS.VERIFIED_EVACUATION,
                subType: 'Evacuation Assembly Hub',
                icon: 'fa-shield-halved'
            };
        }

        // B. Emergency Services (Hospitals, clinics, fire, police)
        const isEmergencyService =
            ['hospital', 'clinic', 'doctors', 'pharmacy', 'fire_station', 'police', 'ambulance_station'].includes(amenity) ||
            ['hospital', 'health'].includes(building) ||
            upperName.includes('HOSPITAL') ||
            upperName.includes('CLINIC') ||
            upperName.includes('RURAL HEALTH') ||
            upperName.includes('POLICE') ||
            upperName.includes('FIRE PROTECTION') ||
            upperName.includes('MDRRM') ||
            upperName.includes('SSMO');

        if (isEmergencyService) {
            let subType = 'Emergency Facility';
            let icon = 'fa-kit-medical';
            if (amenity === 'hospital' || upperName.includes('HOSPITAL')) { subType = 'Hospital'; icon = 'fa-hospital'; }
            else if (amenity === 'clinic' || amenity === 'doctors' || upperName.includes('CLINIC') || upperName.includes('HEALTH')) { subType = 'Health Clinic'; icon = 'fa-house-medical'; }
            else if (amenity === 'fire_station' || upperName.includes('FIRE')) { subType = 'Fire Station'; icon = 'fa-fire-extinguisher'; }
            else if (amenity === 'police' || upperName.includes('POLICE')) { subType = 'Police Station'; icon = 'fa-building-shield'; }

            return {
                ...CLASSIFICATIONS.EMERGENCY_SERVICE,
                subType: subType,
                icon: icon
            };
        }

        // C. Other Mapped Places (Schools, Government, Community, Public, Commercial)
        let subType = 'Public Building';
        let icon = 'fa-building';

        if (['school', 'college', 'university', 'kindergarten'].includes(amenity) || building === 'school') {
            subType = 'Educational Facility';
            icon = 'fa-graduation-cap';
        } else if (office === 'government' || amenity === 'townhall' || amenity === 'courthouse' || tags.government) {
            subType = 'Government Facility';
            icon = 'fa-landmark';
        } else if (amenity === 'community_centre' || amenity === 'social_facility') {
            subType = 'Community Center';
            icon = 'fa-users-line';
        } else if (amenity === 'place_of_worship') {
            subType = 'Place of Worship';
            icon = 'fa-place-of-worship';
        } else if (amenity === 'post_office') {
            subType = 'Post Office';
            icon = 'fa-envelope';
        }

        return {
            ...CLASSIFICATIONS.OTHER_MAPPED_PLACE,
            subType: subType,
            icon: icon
        };
    }

    /**
     * Derive a descriptive label if place is unnamed
     * @param {Object} tags OSM tags
     * @param {Object} classification
     * @returns {string} Name or descriptive label
     */
    function resolvePlaceName(tags = {}, classification) {
        if (tags.name && tags.name.trim()) {
            return tags.name.trim();
        }
        if (tags['name:en'] && tags['name:en'].trim()) {
            return tags['name:en'].trim();
        }
        if (tags.brand && tags.brand.trim()) {
            return tags.brand.trim();
        }

        // Descriptive label instead of inventing a proper name
        if (classification.code === 'VERIFIED_EVACUATION') {
            return 'Designated Evacuation Assembly Point';
        }
        if (classification.code === 'EMERGENCY_SERVICE') {
            return `Unnamed ${classification.subType || 'Emergency Service'}`;
        }
        return `Unnamed ${classification.subType || 'Mapped Facility'}`;
    }

    /**
     * Format available address or identifying details
     * @param {Object} tags OSM tags
     * @returns {string} Address details or empty
     */
    function formatAddress(tags = {}) {
        const parts = [];
        if (tags['addr:housenumber'] && tags['addr:street']) {
            parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
        } else if (tags['addr:street']) {
            parts.push(tags['addr:street']);
        }
        if (tags['addr:suburb'] || tags['addr:barangay']) {
            parts.push(tags['addr:suburb'] || tags['addr:barangay']);
        }
        if (tags['addr:city'] || tags['addr:municipality']) {
            parts.push(tags['addr:city'] || tags['addr:municipality']);
        }
        if (tags.operator) {
            parts.push(`Op: ${tags.operator}`);
        }
        return parts.join(', ');
    }

    // --------------------------------------------------------------------------
    // 4. OVERPASS QUERY BUILDER & EXECUTION
    // --------------------------------------------------------------------------
    /**
     * Build Overpass QL query string
     * @param {number} lat Latitude
     * @param {number} lng Longitude
     * @param {number} radius Radius in meters
     * @returns {string} Overpass QL
     */
    function buildOverpassQuery(lat, lng, radius) {
        const r = Math.min(Math.max(radius || CONFIG.defaultRadius, 200), 10000);
        return `[out:json][timeout:8];
(
  node["amenity"~"hospital|clinic|doctors|pharmacy|police|fire_station|school|college|university|townhall|community_centre"](around:${r},${lat},${lng});
  way["amenity"~"hospital|clinic|doctors|pharmacy|police|fire_station|school|college|university|townhall|community_centre"](around:${r},${lat},${lng});
  node["emergency"~"assembly_point|evacuation_centre"](around:${r},${lat},${lng});
  way["emergency"~"assembly_point|evacuation_centre"](around:${r},${lat},${lng});
  node["office"="government"](around:${r},${lat},${lng});
  way["office"="government"](around:${r},${lat},${lng});
  node["building"~"public|civic|hospital|school"](around:${r},${lat},${lng});
  way["building"~"public|civic|hospital|school"](around:${r},${lat},${lng});
);
out center tags 60;`;
    }

    /**
     * Fetch with timeout helper
     */
    async function fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return res;
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }
    }

    /**
     * Execute Overpass query with automatic endpoint fallback
     * @param {string} query Overpass QL
     * @returns {Promise<Object>} Overpass JSON response
     */
    async function executeOverpassQuery(query) {
        let lastError = null;

        for (const endpoint of CONFIG.endpoints) {
            try {
                const url = `${endpoint}?data=${encodeURIComponent(query)}`;
                const response = await fetchWithTimeout(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} from ${endpoint}`);
                }

                const json = await response.json();
                if (json && Array.isArray(json.elements)) {
                    return json;
                }
            } catch (err) {
                lastError = err;
                console.warn(`[NearbyPlacesService] Endpoint failed (${endpoint}):`, err.message);
                // Try next endpoint
            }
        }

        throw lastError || new Error('All Overpass API endpoints failed');
    }

    // --------------------------------------------------------------------------
    // 5. LOCAL OFFLINE REPOSITORY (Campus Safe Zones & Facilities)
    // --------------------------------------------------------------------------
    /**
     * Retrieve authoritative local facilities from GabayX database / memory
     * @param {number} userLat
     * @param {number} userLng
     * @param {number} radius
     * @returns {Array<Object>} Local items
     */
    function getLocalAuthoritativePlaces(userLat, userLng, radius) {
        const places = [];

        // 1. Authoritative Safe Zones
        const designatedSafeZones = [
            { id: 'sz-principal', name: 'PRINCIPAL FRONT', coords: [7.100589893149529, 124.82393056927546], desc: 'Primary Assembly Zone (Open Ground Evacuation Hub)' },
            { id: 'sz-mendoza', name: 'MENDOZA COURT', coords: [7.100077551009359, 124.82369094608939], desc: 'West Sector Covered Safe Zone' },
            { id: 'sz-tejada', name: 'TEJADA COURT', coords: [7.1001461901808565, 124.82430112059413], desc: 'East Sector Gymnasium Evacuation Hub' }
        ];

        designatedSafeZones.forEach((sz) => {
            const dist = calculateDistance(userLat, userLng, sz.coords[0], sz.coords[1]);
            if (dist <= radius) {
                places.push({
                    id: sz.id,
                    name: sz.name,
                    lat: sz.coords[0],
                    lng: sz.coords[1],
                    distance: dist,
                    distanceFormatted: formatDistance(dist),
                    classification: CLASSIFICATIONS.VERIFIED_EVACUATION,
                    categoryKey: 'safe_zones',
                    subType: 'Authoritative Evacuation Hub',
                    address: sz.desc,
                    isVerifiedSafe: true,
                    safetyStatus: 'Verified Official Safe Zone',
                    source: 'GABAYX_AUTHORITATIVE'
                });
            }
        });

        // 2. Official Emergency Command / Hotlines
        const emergencyHotlines = [
            { id: 'em-ssmo', name: 'USM Security Services (SSMO)', coords: [7.10085, 124.82345], role: 'Campus Security & Dispatch', tel: '(064) 572 2100' },
            { id: 'em-pnp', name: 'Kabacan Philippine National Police (PNP)', coords: [7.11210, 124.82450], role: 'Law Enforcement', tel: '0939-339-3168' },
            { id: 'em-bfp', name: 'Kabacan Bureau of Fire Protection (BFP)', coords: [7.11180, 124.82510], role: 'Fire & Rescue', tel: '0910-048-9571' },
            { id: 'em-afp', name: 'AFP 90th Infantry Battalion', coords: [7.11420, 124.82600], role: 'Defense & Emergency Response', tel: '0956-443-0948' },
            { id: 'em-mdrrm', name: 'Kabacan Municipal DRRM (MDRRM)', coords: [7.11250, 124.82490], role: 'Disaster Operations', tel: '0910-363-3864' },
            { id: 'em-rhu', name: 'Kabacan Rural Health Unit (RHU)', coords: [7.11300, 124.82540], role: 'Emergency Health & Triage', tel: '0926-397-0496' }
        ];

        emergencyHotlines.forEach((em) => {
            const dist = calculateDistance(userLat, userLng, em.coords[0], em.coords[1]);
            if (dist <= radius) {
                places.push({
                    id: em.id,
                    name: em.name,
                    lat: em.coords[0],
                    lng: em.coords[1],
                    distance: dist,
                    distanceFormatted: formatDistance(dist),
                    classification: CLASSIFICATIONS.EMERGENCY_SERVICE,
                    categoryKey: 'emergency_services',
                    subType: em.role,
                    address: `Hotline: ${em.tel}`,
                    isVerifiedSafe: false,
                    safetyStatus: 'Emergency Service (Structural status unverified)',
                    source: 'GABAYX_AUTHORITATIVE'
                });
            }
        });

        // 3. Campus Buildings (BLDG A - BLDG S)
        if (global.BUILDINGS && Array.isArray(global.BUILDINGS)) {
            global.BUILDINGS.forEach((b, idx) => {
                const dist = calculateDistance(userLat, userLng, b.coords[0], b.coords[1]);
                if (dist <= radius) {
                    places.push({
                        id: `bldg-${idx}`,
                        name: b.name,
                        lat: b.coords[0],
                        lng: b.coords[1],
                        distance: dist,
                        distanceFormatted: formatDistance(dist),
                        classification: CLASSIFICATIONS.OTHER_MAPPED_PLACE,
                        categoryKey: 'other_places',
                        subType: 'Campus Facility',
                        address: 'University Campus Sector',
                        isVerifiedSafe: false,
                        safetyStatus: 'Unverified Structure — Not a designated safe zone',
                        source: 'GABAYX_CAMPUS'
                    });
                }
            });
        }

        return places;
    }

    // --------------------------------------------------------------------------
    // 6. MAIN SERVICE INTERFACE
    // --------------------------------------------------------------------------
    /**
     * Find nearby buildings and facilities within radius
     * @param {Object} options
     * @param {number} options.lat User Latitude
     * @param {number} options.lng User Longitude
     * @param {number} [options.radius=2000] Search radius in meters
     * @param {boolean} [options.bypassCache=false]
     * @returns {Promise<Object>} { places, count, radius, isOfflineFallback, searchCenter }
     */
    async function findNearbyPlaces({ lat, lng, radius = CONFIG.defaultRadius, bypassCache = false }) {
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
            throw new Error('Valid latitude and longitude coordinates are required');
        }

        const effectiveRadius = Math.min(Math.max(radius || CONFIG.defaultRadius, 200), 10000);
        const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${effectiveRadius}`;

        // 1. Check in-memory cache
        if (!bypassCache && memoryCache.has(cacheKey)) {
            const cached = memoryCache.get(cacheKey);
            if (Date.now() - cached.timestamp < CONFIG.cacheDurationMs) {
                return cached.data;
            }
        }

        let rawElements = [];
        let isOfflineFallback = false;

        // 2. Fetch live data if online
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        if (isOnline) {
            try {
                const query = buildOverpassQuery(lat, lng, effectiveRadius);
                const overpassResponse = await executeOverpassQuery(query);
                rawElements = overpassResponse.elements || [];
            } catch (err) {
                console.warn('[NearbyPlacesService] Overpass API query failed, falling back to local database:', err.message);
                isOfflineFallback = true;
            }
        } else {
            isOfflineFallback = true;
        }

        // 3. Normalize Overpass elements
        const osmPlaces = [];
        for (const el of rawElements) {
            const elLat = el.lat !== undefined ? el.lat : (el.center ? el.center.lat : null);
            const elLon = el.lon !== undefined ? el.lon : (el.center ? el.center.lon : null);
            if (elLat === null || elLon === null) continue;

            const dist = calculateDistance(lat, lng, elLat, elLon);
            if (dist > effectiveRadius) continue; // outside boundary

            const tags = el.tags || {};
            const classification = classifyPlace(tags, tags.name);
            const name = resolvePlaceName(tags, classification);
            const address = formatAddress(tags);

            osmPlaces.push({
                id: `osm-${el.type}-${el.id}`,
                name: name,
                lat: elLat,
                lng: elLon,
                distance: dist,
                distanceFormatted: formatDistance(dist),
                classification: classification,
                categoryKey: classification.categoryKey,
                subType: classification.subType,
                address: address,
                isVerifiedSafe: classification.isVerifiedSafe,
                safetyStatus: classification.statusText,
                source: 'OPENSTREETMAP',
                tags: tags
            });
        }

        // 4. Merge with local authoritative places (deduplicating)
        const localPlaces = getLocalAuthoritativePlaces(lat, lng, effectiveRadius);
        const combined = [...localPlaces];

        for (const op of osmPlaces) {
            // Deduplicate: check if a local place already exists within 20 meters with similar name
            const exists = combined.some((lp) => {
                const distBetween = calculateDistance(lp.lat, lp.lng, op.lat, op.lng);
                return distBetween < 20 || (distBetween < 80 && lp.name.toLowerCase() === op.name.toLowerCase());
            });
            if (!exists) {
                combined.push(op);
            }
        }

        // 5. Sort by distance ascending (closest first)
        combined.sort((a, b) => a.distance - b.distance);

        const result = {
            places: combined,
            count: combined.length,
            radius: effectiveRadius,
            radiusFormatted: formatDistance(effectiveRadius),
            isOfflineFallback: isOfflineFallback,
            searchCenter: { lat, lng },
            retrievedAt: new Date().toISOString()
        };

        // Cache result
        memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });

        return result;
    }

    /**
     * Clear in-memory cache
     */
    function clearCache() {
        memoryCache.clear();
    }

    // Export interface
    global.GabayXNearbyPlacesService = {
        findNearbyPlaces,
        calculateDistance,
        formatDistance,
        classifyPlace,
        clearCache,
        CONFIG,
        CLASSIFICATIONS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.GabayXNearbyPlacesService;
    }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
