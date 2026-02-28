CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS satellites (
  id SERIAL PRIMARY KEY,
  norad_id VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  international_designator VARCHAR(20),
  object_type VARCHAR(50),
  country VARCHAR(100),
  launch_date DATE,
  decay_date DATE,
  is_active BOOLEAN DEFAULT true,
  data_source VARCHAR(50) DEFAULT 'Space-Track',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tle_data (
  id SERIAL PRIMARY KEY,
  satellite_id INTEGER NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  norad_id VARCHAR(10) NOT NULL,
  epoch TIMESTAMP WITH TIME ZONE NOT NULL,
  
  classification CHAR(1),
  mean_motion_derivative DOUBLE PRECISION,
  mean_motion_sec_derivative DOUBLE PRECISION,
  bstar DOUBLE PRECISION,
  ephemeris_type INTEGER,
  element_set_number INTEGER,
  
  inclination DOUBLE PRECISION NOT NULL,
  right_ascension DOUBLE PRECISION NOT NULL,
  eccentricity DOUBLE PRECISION NOT NULL,
  argument_of_perigee DOUBLE PRECISION NOT NULL,
  mean_anomaly DOUBLE PRECISION NOT NULL,
  mean_motion DOUBLE PRECISION NOT NULL,
  revolution_number INTEGER,
  
  tle_line0 TEXT,
  tle_line1 TEXT NOT NULL,
  tle_line2 TEXT NOT NULL,
  
  data_source VARCHAR(50) DEFAULT 'Space-Track',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(satellite_id, epoch)
);

CREATE TABLE IF NOT EXISTS collision_risks (
  id SERIAL PRIMARY KEY,
  
  primary_satellite_id INTEGER NOT NULL REFERENCES satellites(id),
  primary_norad_id VARCHAR(10) NOT NULL,
  
  secondary_satellite_id INTEGER REFERENCES satellites(id),
  secondary_norad_id VARCHAR(10) NOT NULL,
  
  tca TIMESTAMP WITH TIME ZONE NOT NULL,
  
  probability DOUBLE PRECISION,
  miss_distance DOUBLE PRECISION,
  relative_velocity DOUBLE PRECISION,
  
  primary_position_x DOUBLE PRECISION,
  primary_position_y DOUBLE PRECISION,
  primary_position_z DOUBLE PRECISION,
  secondary_position_x DOUBLE PRECISION,
  secondary_position_y DOUBLE PRECISION,
  secondary_position_z DOUBLE PRECISION,
  
  risk_level VARCHAR(20),
  requires_maneuver BOOLEAN DEFAULT false,
  

  status VARCHAR(50) DEFAULT 'ACTIVE',
  maneuver_planned BOOLEAN DEFAULT false,
  
  maneuver_plan TEXT,
  maneuver_delta_v DOUBLE PRECISION,
  
  data_source VARCHAR(50) DEFAULT 'Space-Track CDM',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  INDEX idx_collision_tca (tca),
  INDEX idx_collision_primary (primary_satellite_id),
  INDEX idx_collision_status (status)
);

CREATE TABLE IF NOT EXISTS data_imports (
  id SERIAL PRIMARY KEY,
  import_type VARCHAR(50) NOT NULL,
  source VARCHAR(100) DEFAULT 'Space-Track',
  status VARCHAR(20) NOT NULL,
  records_imported INTEGER DEFAULT 0,
  error_message TEXT,
  import_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  import_completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  satellite_id INTEGER NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  notification_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, satellite_id)
);

CREATE TABLE IF NOT EXISTS trajectory_predictions (
  id SERIAL PRIMARY KEY,
  satellite_id INTEGER NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  prediction_time TIMESTAMP WITH TIME ZONE NOT NULL,
  prediction_horizon INTEGER NOT NULL,
  
  predicted_positions JSONB NOT NULL,
  confidence_score DOUBLE PRECISION,
  
  model_version VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_prediction_satellite (satellite_id),
  INDEX idx_prediction_time (prediction_time)
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_satellites_updated_at BEFORE UPDATE ON satellites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collision_risks_updated_at BEFORE UPDATE ON collision_risks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO satellites (norad_id, name, international_designator, object_type, country, launch_date, data_source)
VALUES 
  ('25544', 'ISS (ZARYA)', '1998-067A', 'PAYLOAD', 'USA', '1998-11-20', 'Space-Track'),
  ('43013', 'STARLINK-30', '2017-073A', 'PAYLOAD', 'USA', '2017-12-23', 'Space-Track'),
  ('48274', 'COSMOS 2542', '2019-015A', 'PAYLOAD', 'RUSSIA', '2019-11-25', 'Space-Track')
ON CONFLICT (norad_id) DO NOTHING;

COMMENT ON TABLE satellites IS 'Space objects tracked from Space-Track.org database';
COMMENT ON TABLE tle_data IS 'Two-Line Element orbital data from Space-Track.org';
COMMENT ON TABLE collision_risks IS 'Conjunction Data Messages (CDM) and collision predictions from Space-Track';
COMMENT ON TABLE data_imports IS 'Log of data imports from Space-Track.org';
