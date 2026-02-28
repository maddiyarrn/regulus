
INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('44713', 'STARLINK-1007', 'United States', '2019-11-11', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '44713', '2024-10-02 14:54:18', 16.29877576, 0.00083240, 53.0382, 329.7306, 5.1336, 119.9714,
  '1 44713U 19074A   24276.62104521  .27315559  12225-4  58439-2 0  9996',
  '2 44713  53.0382 329.7306 0008324   5.1336 119.9714 16.29877576270703',
  0.0058439, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '44713';

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('44716', 'STARLINK-1010', 'United States', '2019-11-11', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '44716', '2025-11-15 09:04:47', 16.44501369, 0.00015480, 53.0263, 253.7273, 273.5151, 86.5720,
  '1 44716U 19074D   25319.37832659  .08752573  12489-4  31625-3 0  9991',
  '2 44716  53.0263 253.7273 0001548 273.5151  86.5720 16.44501369332706',
  0.00031625, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '44716';

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('44246', 'STARLINK-46', 'United States', '2019-05-24', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '44246', '2020-02-20 12:53:54', 16.40063924, 0.00269630, 52.9662, 262.5732, 244.6149, 115.2104,
  '1 44246U 19029M   20051.53743625  .17658540  12175-4  76906-3 0  9991',
  '2 44246  52.9662 262.5732 0026963 244.6149 115.2104 16.40063924 42707',
  0.00076906, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '44246';

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('45211', 'STARLINK-1220', 'United States', '2020-02-17', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '45211', '2020-03-09 22:00:01', 15.75746283, 0.00274510, 53.0024, 162.4808, 118.7601, 331.9927,
  '1 45211U 20012AK  20069.91667824  .00723224  00000-0  41594-2 0  9993',
  '2 45211  53.0024 162.4808 0027451 118.7601 331.9927 15.75746283  3703',
  0.0041594, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '45211';

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('44948', 'STARLINK-1118', 'United States', '2020-01-07', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '44948', '2020-04-02 02:46:14', 16.33333815, 0.00064580, 52.9916, 320.6390, 255.8970, 104.1355,
  '1 44948U 20001AL  20093.11544131 +.10026385 +12155-4 +15322-2 0  9994',
  '2 44948 052.9916 320.6390 0006458 255.8970 104.1355 16.33333815013677',
  0.0015322, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '44948';

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('44278', 'STARLINK-67', 'United States', '2019-05-24', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '44278', '2020-05-27 08:59:57', 16.44125369, 0.00054970, 52.9725, 113.8189, 260.1827, 100.3413,
  '1 44278U 19029AV  20148.37496501  .35214307  12466-4  12490-2 0  9992',
  '2 44278  52.9725 113.8189 0005497 260.1827 100.3413 16.44125369 58533',
  0.0012490, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '44278';

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('55911', 'ELECTRON R/B', 'Unknown', NULL, 'ROCKET BODY', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '55911', '2023-03-17 01:13:39', 16.12542287, 0.00951450, 44.0016, 312.6145, 136.0353, 224.7980,
  '1 55911U 23035D   23076.05114839 -.00002992  94638-5  00000+0 0  9990',
  '2 55911  44.0016 312.6145 0095145 136.0353 224.7980 16.12542287    16',
  0.0, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '55911';

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('44717', 'STARLINK-1011', 'United States', '2019-11-11', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '44717', '2025-12-06 00:42:39', 16.45144333, 0.00067320, 53.0288, 205.3540, 242.0271, 118.0096,
  '1 44717U 19074E   25340.02962256  .10366512  12452-4  28445-3 0  9998',
  '2 44717  53.0288 205.3540 0006732 242.0271 118.0096 16.45144333335219',
  0.00028445, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '44717';

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('25544', 'ISS (ZARYA)', 'International', '1998-11-20', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;

INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('20580', 'HST (Hubble Space Telescope)', 'United States', '1990-04-24', 'PAYLOAD', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP;
