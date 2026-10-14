/**
 * GabayX Campus Geographic Data & Authoritative Evacuation Catalog
 * 
 * Sourced directly from KNHS Campus reference coordinates in student.html:
 * - 3 Official Safe Assembly Zones
 * - 19 Designated Campus Buildings (A through S)
 * - 3 Pre-verified Evacuation Route Polylines
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface CampusBuilding {
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

// KNHS Campus Center & Evacuation Hub
export const CAMPUS_CENTER: LatLng = {
  latitude: 7.100589893149529,
  longitude: 124.82393056927546,
};

// Campus Perimeter Bounds (KNHS & Kabacan vicinity)
export const CAMPUS_BOUNDS = {
  south: 7.0980,
  west: 124.8210,
  north: 7.1030,
  east: 124.8270,
};

// 3 Designated Safe Assembly Zones
export const SAFE_ASSEMBLY_ZONES: SafeAssemblyZone[] = [
  {
    id: 'zone_principal_front',
    name: 'Principal Front Hub',
    shortLabel: 'Hub 1',
    description: 'Primary campus command & disaster relief assembly area.',
    isPrimaryHub: true,
    disasterTypes: ['EARTHQUAKE', 'FIRE'],
    latitude: 7.100589893149529,
    longitude: 124.82393056927546,
    capacity: '500+ Persons',
  },
  {
    id: 'zone_mendoza_court',
    name: 'Mendoza Court Safe Zone',
    shortLabel: 'Hub 2',
    description: 'Open-air athletic court designated for southern wing classrooms.',
    isPrimaryHub: false,
    disasterTypes: ['FIRE', 'FLOOD'],
    latitude: 7.100077551009359,
    longitude: 124.82369094608939,
    capacity: '350 Persons',
  },
  {
    id: 'zone_tejada_court',
    name: 'Tejada Court Safe Zone',
    shortLabel: 'Hub 3',
    description: 'Elevated court safe assembly for science & technology buildings.',
    isPrimaryHub: false,
    disasterTypes: ['FLOOD', 'FIRE'],
    latitude: 7.1001461901808565,
    longitude: 124.82430112059413,
    capacity: '300 Persons',
  },
];

// 19 Campus Buildings (A through S)
export const CAMPUS_BUILDINGS: CampusBuilding[] = [
  { id: 'bldg_a', name: 'Building A', shortLetter: 'A', category: 'Administrative Wing', latitude: 7.100767, longitude: 124.824077 },
  { id: 'bldg_b', name: 'Building B', shortLetter: 'B', category: 'Classrooms Block', latitude: 7.100636, longitude: 124.824271 },
  { id: 'bldg_c', name: 'Building C', shortLetter: 'C', category: 'Senior High Hall', latitude: 7.100458, longitude: 124.824615 },
  { id: 'bldg_d', name: 'Building D', shortLetter: 'D', category: 'Laboratories', latitude: 7.100415, longitude: 124.824701 },
  { id: 'bldg_e', name: 'Building E', shortLetter: 'E', category: 'Classrooms Block', latitude: 7.100423, longitude: 124.824379 },
  { id: 'bldg_f', name: 'Building F', shortLetter: 'F', category: 'Junior High Hall', latitude: 7.100282, longitude: 124.824365 },
  { id: 'bldg_g', name: 'Building G', shortLetter: 'G', category: 'Academic Wing', latitude: 7.100051, longitude: 124.824532 },
  { id: 'bldg_h', name: 'Building H', shortLetter: 'H', category: 'Classrooms Block', latitude: 7.099910, longitude: 124.824140 },
  { id: 'bldg_i', name: 'Building I', shortLetter: 'I', category: 'Academic Wing', latitude: 7.099777, longitude: 124.824108 },
  { id: 'bldg_j', name: 'Building J', shortLetter: 'J', category: 'Southern Hall', latitude: 7.099643, longitude: 124.824357 },
  { id: 'bldg_k', name: 'Building K', shortLetter: 'K', category: 'Classrooms Block', latitude: 7.099630, longitude: 124.824164 },
  { id: 'bldg_l', name: 'Building L', shortLetter: 'L', category: 'Library & Learning', latitude: 7.099713, longitude: 124.823939 },
  { id: 'bldg_m', name: 'Building M', shortLetter: 'M', category: 'Faculty Office', latitude: 7.099851, longitude: 124.823724 },
  { id: 'bldg_n', name: 'Building N', shortLetter: 'N', category: 'Central Classrooms', latitude: 7.100224, longitude: 124.824046 },
  { id: 'bldg_o', name: 'Building O', shortLetter: 'O', category: 'Principal Annex', latitude: 7.100439, longitude: 124.823966 },
  { id: 'bldg_p', name: 'Building P', shortLetter: 'P', category: 'Health Clinic', latitude: 7.100232, longitude: 124.823880 },
  { id: 'bldg_q', name: 'Building Q', shortLetter: 'Q', category: 'Student Services', latitude: 7.100362, longitude: 124.823746 },
  { id: 'bldg_r', name: 'Building R', shortLetter: 'R', category: 'Auditorium Annex', latitude: 7.100351, longitude: 124.823617 },
  { id: 'bldg_s', name: 'Building S', shortLetter: 'S', category: 'Gatehouse & Guard', latitude: 7.100532, longitude: 124.823703 },
];

// Pre-verified Authoritative Evacuation Routes
export const EVACUATION_ROUTES: EvacuationRoute[] = [
  {
    id: 'route_principal_front',
    name: 'Primary Evacuation Route (Principal Front)',
    targetSafeZoneId: 'zone_principal_front',
    description: 'Main campus corridor leading to the Primary Evacuation Hub.',
    color: '#10b981', // Emerald green
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
    name: 'Secondary Evacuation Route (Mendoza Court)',
    targetSafeZoneId: 'zone_mendoza_court',
    description: 'Fast exit pathway towards outdoor Mendoza Court athletic grounds.',
    color: '#06b6d4', // Cyan
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
    name: 'Tertiary Evacuation Route (Tejada Court)',
    targetSafeZoneId: 'zone_tejada_court',
    description: 'Elevated route towards Tejada Court for eastern campus sector.',
    color: '#f59e0b', // Amber
    coordinates: [
      { latitude: 7.10045, longitude: 124.82460 },
      { latitude: 7.10035, longitude: 124.82445 },
      { latitude: 7.10020, longitude: 124.82435 },
      { latitude: 7.1001461901808565, longitude: 124.82430112059413 },
    ],
    estimatedMinutes: 3,
  },
];
