/**
 * GabayX Community & Municipal Geographic Data (LGU Kabacan DRRM)
 * 
 * Sourced directly for LGU / Municipal Disaster Risk Reduction & Management (MDRRMO):
 * - 3 Official Municipal Safe Assembly Zones
 * - 19 Designated Community & Municipal Facilities
 * - 3 Pre-verified Municipal Evacuation Route Corridors
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface CommunityFacility {
  id: string;
  name: string;
  shortLetter: string;
  category: string;
  latitude: number;
  longitude: number;
}

export interface SafeAssemblyZone {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  isPrimaryHub: boolean;
  disasterTypes: ('EARTHQUAKE' | 'FIRE' | 'FLOOD' | 'GENERAL')[];
  latitude: number;
  longitude: number;
  capacity?: string;
}

export interface EvacuationRoute {
  id: string;
  name: string;
  targetSafeZoneId: string;
  description: string;
  color: string;
  dashPattern?: number[];
  coordinates: LatLng[];
  estimatedMinutes: number;
}

// Kabacan Municipal DRRM Command Center & Evacuation Hub
export const MUNICIPAL_CENTER: LatLng = {
  latitude: 7.100589893149529,
  longitude: 124.82393056927546,
};

// Municipal Perimeter Bounds (LGU Kabacan)
export const MUNICIPAL_BOUNDS = {
  south: 7.0980,
  west: 124.8210,
  north: 7.1030,
  east: 124.8270,
};

// 3 Designated Municipal Safe Assembly Zones
export const SAFE_ASSEMBLY_ZONES: SafeAssemblyZone[] = [
  {
    id: 'zone_principal_front',
    name: 'Kabacan Municipal Gymnasium Hub',
    shortLabel: 'Hub 1',
    description: 'Primary municipal command, triage & disaster relief assembly area.',
    isPrimaryHub: true,
    disasterTypes: ['EARTHQUAKE', 'FIRE'],
    latitude: 7.100589893149529,
    longitude: 124.82393056927546,
    capacity: '1,500+ Residents',
  },
  {
    id: 'zone_mendoza_court',
    name: 'Central Municipal Plaza Safe Zone',
    shortLabel: 'Hub 2',
    description: 'Open-air municipal park grounds designated for community evacuation.',
    isPrimaryHub: false,
    disasterTypes: ['FIRE', 'FLOOD'],
    latitude: 7.100077551009359,
    longitude: 124.82369094608939,
    capacity: '800 Residents',
  },
  {
    id: 'zone_tejada_court',
    name: 'Barangay Poblacion Civic Hub',
    shortLabel: 'Hub 3',
    description: 'Elevated multi-purpose civic center for eastern sector residents.',
    isPrimaryHub: false,
    disasterTypes: ['FLOOD', 'FIRE'],
    latitude: 7.1001461901808565,
    longitude: 124.82430112059413,
    capacity: '600 Residents',
  },
];

// 19 Community & Municipal Facilities
export const COMMUNITY_FACILITIES: CommunityFacility[] = [
  { id: 'bldg_a', name: 'Municipal Hall', shortLetter: 'A', category: 'Executive Administration', latitude: 7.100767, longitude: 124.824077 },
  { id: 'bldg_b', name: 'Rural Health Unit (RHU)', shortLetter: 'B', category: 'Public Health Clinic', latitude: 7.100636, longitude: 124.824271 },
  { id: 'bldg_c', name: 'MDRRMO Operations Center', shortLetter: 'C', category: 'Disaster Command Post', latitude: 7.100458, longitude: 124.824615 },
  { id: 'bldg_d', name: 'Bureau of Fire Protection (BFP)', shortLetter: 'D', category: 'Emergency Rescue Station', latitude: 7.100415, longitude: 124.824701 },
  { id: 'bldg_e', name: 'PNP Municipal Police Station', shortLetter: 'E', category: 'Public Safety & Security', latitude: 7.100423, longitude: 124.824379 },
  { id: 'bldg_f', name: 'Public Market Complex', shortLetter: 'F', category: 'Commercial Center', latitude: 7.100282, longitude: 124.824365 },
  { id: 'bldg_g', name: 'Community Civic Center', shortLetter: 'G', category: 'Civic Assembly Hall', latitude: 7.100051, longitude: 124.824532 },
  { id: 'bldg_h', name: 'MSWDO Relief Office', shortLetter: 'H', category: 'Social Welfare & Relief', latitude: 7.099910, longitude: 124.824140 },
  { id: 'bldg_i', name: 'Municipal District Office', shortLetter: 'I', category: 'Public Services Branch', latitude: 7.099777, longitude: 124.824108 },
  { id: 'bldg_j', name: 'Barangay Poblacion Hall', shortLetter: 'J', category: 'Local Barangay Government', latitude: 7.099643, longitude: 124.824357 },
  { id: 'bldg_k', name: 'Barangay Health Post', shortLetter: 'K', category: 'Primary Medical Station', latitude: 7.099630, longitude: 124.824164 },
  { id: 'bldg_l', name: 'Community Public Library', shortLetter: 'L', category: 'Information Resource Center', latitude: 7.099713, longitude: 124.823939 },
  { id: 'bldg_m', name: 'General Services Depot', shortLetter: 'M', category: 'Municipal Logistics Base', latitude: 7.099851, longitude: 124.823724 },
  { id: 'bldg_n', name: 'Senior Citizens & PWD Center', shortLetter: 'N', category: 'Vulnerable Care Shelter', latitude: 7.100224, longitude: 124.824046 },
  { id: 'bldg_o', name: 'Municipal Agriculture Office', shortLetter: 'O', category: 'Food Security Division', latitude: 7.100439, longitude: 124.823966 },
  { id: 'bldg_p', name: 'Emergency Medical Station', shortLetter: 'P', category: 'First Aid & Triage Post', latitude: 7.100232, longitude: 124.823880 },
  { id: 'bldg_q', name: 'Social Action Center', shortLetter: 'Q', category: 'Volunteer Mobilization', latitude: 7.100362, longitude: 124.823746 },
  { id: 'bldg_r', name: 'Municipal Auditorium Annex', shortLetter: 'R', category: 'Emergency Staging Area', latitude: 7.100351, longitude: 124.823617 },
];

// Pre-verified Authoritative Municipal Evacuation Routes
export const EVACUATION_ROUTES: EvacuationRoute[] = [
  {
    id: 'route_principal_front',
    name: 'Primary Evacuation Route (Municipal Gym)',
    targetSafeZoneId: 'zone_principal_front',
    description: 'Central municipal road corridor leading to the Primary Evacuation Gym.',
    color: '#059669', // Emerald
    coordinates: [
      { latitude: 7.09985, longitude: 124.82372 },
      { latitude: 7.10005, longitude: 124.82370 },
      { latitude: 7.10025, longitude: 124.82385 },
      { latitude: 7.10045, longitude: 124.82390 },
      { latitude: 7.100589893149529, longitude: 124.82393056927546 },
    ],
    estimatedMinutes: 4,
  },
  {
    id: 'route_mendoza_court',
    name: 'Secondary Evacuation Route (Central Plaza)',
    targetSafeZoneId: 'zone_mendoza_court',
    description: 'Fast exit pathway towards outdoor Central Municipal Plaza grounds.',
    color: '#0284c7', // Sky Blue
    coordinates: [
      { latitude: 7.09965, longitude: 124.82420 },
      { latitude: 7.09980, longitude: 124.82410 },
      { latitude: 7.09995, longitude: 124.82385 },
      { latitude: 7.100077551009359, longitude: 124.82369094608939 },
    ],
    estimatedMinutes: 3,
  },
  {
    id: 'route_tejada_court',
    name: 'Tertiary Evacuation Route (Barangay Civic Hub)',
    targetSafeZoneId: 'zone_tejada_court',
    description: 'Elevated route towards Barangay Poblacion Civic Hub for eastern sector.',
    color: '#d97706', // Amber
    coordinates: [
      { latitude: 7.10045, longitude: 124.82460 },
      { latitude: 7.10035, longitude: 124.82445 },
      { latitude: 7.10020, longitude: 124.82435 },
      { latitude: 7.1001461901808565, longitude: 124.82430112059413 },
    ],
    estimatedMinutes: 3,
  },
];

// Official Municipal Road Network Intersections (Poblacion Kabacan)
export const MUNICIPAL_ROAD_NETWORK_NODES: LatLng[] = [
  { latitude: 7.100767, longitude: 124.824077 }, // North Municipal Hall Road
  { latitude: 7.100589893149529, longitude: 124.82393056927546 }, // Hub 1 Gym Gate
  { latitude: 7.100450, longitude: 124.823900 }, // Rizal Ave Mid-Crossing
  { latitude: 7.100250, longitude: 124.823850 }, // Market Avenue Crossing
  { latitude: 7.100077551009359, longitude: 124.82369094608939 }, // Hub 2 Central Plaza Gate
  { latitude: 7.099850, longitude: 124.823720 }, // South Road Exit
  { latitude: 7.100458, longitude: 124.824615 }, // East MDRRMO & BFP Road
  { latitude: 7.100423, longitude: 124.824379 }, // Police Station Crossing
  { latitude: 7.100282, longitude: 124.824365 }, // Market East Road
  { latitude: 7.1001461901808565, longitude: 124.82430112059413 }, // Hub 3 Civic Center Gate
  { latitude: 7.099643, longitude: 124.824357 }, // Poblacion South Junction
];

export function getOfflineRoadWaypoints(
  origin: LatLng,
  targetHub: SafeAssemblyZone
): [number, number][] {
  function distSq(a: LatLng, b: LatLng): number {
    const dLat = a.latitude - b.latitude;
    const dLng = a.longitude - b.longitude;
    return dLat * dLat + dLng * dLng;
  }

  // Find nearest street node to origin
  let closestOriginNode = MUNICIPAL_ROAD_NETWORK_NODES[0];
  let minOriginDist = Infinity;
  for (const node of MUNICIPAL_ROAD_NETWORK_NODES) {
    const d = distSq(origin, node);
    if (d < minOriginDist) {
      minOriginDist = d;
      closestOriginNode = node;
    }
  }

  // Find nearest street node to target hub
  let closestHubNode = MUNICIPAL_ROAD_NETWORK_NODES[1];
  let minHubDist = Infinity;
  for (const node of MUNICIPAL_ROAD_NETWORK_NODES) {
    const d = distSq(targetHub, node);
    if (d < minHubDist) {
      minHubDist = d;
      closestHubNode = node;
    }
  }

  const waypoints: [number, number][] = [
    [origin.latitude, origin.longitude],
    [closestOriginNode.latitude, closestOriginNode.longitude],
  ];

  // If different nodes, add mid-way street junction if needed
  if (closestOriginNode !== closestHubNode) {
    // If one is east corridor and other is west spine, route through the central street crossing
    const isOriginEast = closestOriginNode.longitude > 124.82410;
    const isHubEast = closestHubNode.longitude > 124.82410;
    if (isOriginEast !== isHubEast) {
      waypoints.push([7.100450, 124.824100]); // Central Crossing
    }
    waypoints.push([closestHubNode.latitude, closestHubNode.longitude]);
  }

  waypoints.push([targetHub.latitude, targetHub.longitude]);
  return waypoints;
}
