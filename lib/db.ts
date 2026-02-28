import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const sql = neon(process.env.DATABASE_URL);

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
  last_login: Date | null;
}

export interface Satellite {
  id: number;
  norad_id: string;
  name: string;
  international_designator: string | null;
  object_type: string | null;
  country: string | null;
  launch_date: Date | null;
  decay_date: Date | null;
  is_active: boolean;
  data_source: string;
  created_at: Date;
  updated_at: Date;
}

export interface TLEData {
  id: number;
  satellite_id: number;
  norad_id: string;
  epoch: Date;
  classification: string | null;
  mean_motion_derivative: number | null;
  mean_motion_sec_derivative: number | null;
  bstar: number | null;
  ephemeris_type: number | null;
  element_set_number: number | null;
  inclination: number;
  right_ascension: number;
  eccentricity: number;
  argument_of_perigee: number;
  mean_anomaly: number;
  mean_motion: number;
  revolution_number: number | null;
  tle_line0: string | null;
  tle_line1: string;
  tle_line2: string;
  data_source: string;
  created_at: Date;
}

export interface CollisionRisk {
  id: number;
  primary_satellite_id: number;
  primary_norad_id: string;
  secondary_satellite_id: number | null;
  secondary_norad_id: string;
  tca: Date;
  probability: number | null;
  miss_distance: number | null;
  relative_velocity: number | null;
  primary_position_x: number | null;
  primary_position_y: number | null;
  primary_position_z: number | null;
  secondary_position_x: number | null;
  secondary_position_y: number | null;
  secondary_position_z: number | null;
  risk_level: string | null;
  requires_maneuver: boolean;
  status: string;
  maneuver_planned: boolean;
  maneuver_plan: string | null;
  maneuver_delta_v: number | null;
  data_source: string;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

export interface DataImport {
  id: number;
  import_type: string;
  source: string;
  status: string;
  records_imported: number;
  error_message: string | null;
  import_started_at: Date;
  import_completed_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface TrajectoryPrediction {
  id: number;
  satellite_id: number;
  prediction_time: Date;
  prediction_horizon: number;
  predicted_positions: Array<{
    time: string;
    x: number;
    y: number;
    z: number;
  }>;
  confidence_score: number | null;
  model_version: string | null;
  created_at: Date;
}
