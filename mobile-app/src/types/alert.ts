/**
 * GabayX Mobile - Disaster Alert Types
 * Real-time emergency announcement payload received from Admin Console
 */

export type DisasterType =
  | 'EARTHQUAKE'
  | 'FIRE'
  | 'FLOOD'
  | 'TYPHOON'
  | 'TSUNAMI'
  | 'LANDSLIDE'
  | 'SUPPLY'
  | 'SAFE'
  | 'CLEAR'
  | string;

export interface DisasterAlert {
  type: DisasterType;
  message: string;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
}
