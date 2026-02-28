#!/usr/bin/env python3
"""
Import Space-Track.org CSV data into Neon PostgreSQL database
This script processes multiple CSV files and inserts satellite and TLE data
"""

import csv
import os
from datetime import datetime

csv_files = [
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_791971805-N4BH4.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_474054335-fQZrH.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_1682931738-7didF.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_1774230270-Bc1fE.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_1429991835-P54b7.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_1187940612-E1NWH.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_1936799587-XfRN3.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_2124166857-BIkTJ.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_2103780175-fFRP4.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_1221268076-K8k3J.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_1320685227-7QOJ2.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_312281515-kcXpM.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_1634166539-H7jnm.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_2024449719-SOSO4.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_708139068-iA1TG.csv",
]

satellites_data = {}
tle_data_list = []

print(f"Processing {len(csv_files)} CSV files from Space-Track.org...")

for csv_file in csv_files:
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                norad_id = row['NORAD_CAT_ID']
                
                if norad_id not in satellites_data:
                    satellites_data[norad_id] = {
                        'norad_id': norad_id,
                        'name': row['OBJECT_NAME'],
                        'country_code': row.get('COUNTRY_CODE', 'UNKNOWN'),
                        'launch_date': row.get('LAUNCH_DATE', None),
                        'object_type': row.get('OBJECT_TYPE', 'UNKNOWN'),
                        'rcs_size': row.get('RCS_SIZE', 'UNKNOWN'),
                        'data_source': 'Space-Track.org'
                    }
                
                tle_data_list.append({
                    'norad_id': norad_id,
                    'epoch': row['EPOCH'],
                    'mean_motion': float(row['MEAN_MOTION']),
                    'eccentricity': float(row['ECCENTRICITY']),
                    'inclination': float(row['INCLINATION']),
                    'ra_of_asc_node': float(row['RA_OF_ASC_NODE']),
                    'arg_of_pericenter': float(row['ARG_OF_PERICENTER']),
                    'mean_anomaly': float(row['MEAN_ANOMALY']),
                    'tle_line1': row['TLE_LINE1'],
                    'tle_line2': row['TLE_LINE2'],
                    'bstar': float(row.get('BSTAR', 0)),
                    'mean_motion_dot': float(row.get('MEAN_MOTION_DOT', 0)),
                    'mean_motion_ddot': float(row.get('MEAN_MOTION_DDOT', 0)),
                    'data_source': 'Space-Track.org'
                })
    except Exception as e:
        print(f"Error processing {csv_file}: {e}")

print(f"\nFound {len(satellites_data)} unique satellites")
print(f"Found {len(tle_data_list)} TLE records")
print("\nGenerating SQL INSERT statements...\n")

sql_statements = []

for norad_id, sat in satellites_data.items():
    name_escaped = sat['name'].replace("'", "''")
    launch_date = f"'{sat['launch_date']}'" if sat['launch_date'] else 'NULL'
    
    sql = f"""
INSERT INTO satellites (norad_id, name, country_code, launch_date, object_type, rcs_size, data_source)
VALUES ('{norad_id}', '{name_escaped}', '{sat['country_code']}', {launch_date}, '{sat['object_type']}', '{sat['rcs_size']}', '{sat['data_source']}')
ON CONFLICT (norad_id) DO UPDATE SET
    name = EXCLUDED.name,
    country_code = EXCLUDED.country_code,
    launch_date = EXCLUDED.launch_date,
    object_type = EXCLUDED.object_type,
    rcs_size = EXCLUDED.rcs_size,
    updated_at = CURRENT_TIMESTAMP;
"""
    sql_statements.append(sql.strip())

tle_by_satellite = {}
for tle in tle_data_list:
    norad = tle['norad_id']
    if norad not in tle_by_satellite:
        tle_by_satellite[norad] = []
    tle_by_satellite[norad].append(tle)

for norad, tles in tle_by_satellite.items():
    tles_sorted = sorted(tles, key=lambda x: x['epoch'], reverse=True)
    latest_tle = tles_sorted[0]
    
    tle1_escaped = latest_tle['tle_line1'].replace("'", "''")
    tle2_escaped = latest_tle['tle_line2'].replace("'", "''")
    
    sql = f"""
INSERT INTO tle_data (satellite_id, epoch, mean_motion, eccentricity, inclination, ra_of_asc_node, arg_of_pericenter, mean_anomaly, tle_line1, tle_line2, bstar, mean_motion_dot, mean_motion_ddot, data_source)
SELECT s.id, '{latest_tle['epoch']}', {latest_tle['mean_motion']}, {latest_tle['eccentricity']}, {latest_tle['inclination']}, {latest_tle['ra_of_asc_node']}, {latest_tle['arg_of_pericenter']}, {latest_tle['mean_anomaly']}, '{tle1_escaped}', '{tle2_escaped}', {latest_tle['bstar']}, {latest_tle['mean_motion_dot']}, {latest_tle['mean_motion_ddot']}, '{latest_tle['data_source']}'
FROM satellites s WHERE s.norad_id = '{norad}';
"""
    sql_statements.append(sql.strip())

output_file = 'scripts/002-import-data.sql'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write("-- Import Space-Track.org satellite and TLE data\n")
    f.write(f"-- Generated: {datetime.now().isoformat()}\n")
    f.write(f"-- Source: Space-Track.org CSV files\n")
    f.write(f"-- Satellites: {len(satellites_data)}\n")
    f.write(f"-- TLE records: {len(tle_by_satellite)}\n\n")
    f.write("BEGIN;\n\n")
    f.write("\n".join(sql_statements))
    f.write("\n\nCOMMIT;\n")

print(f"✓ SQL file generated: {output_file}")
print(f"✓ Ready to execute {len(sql_statements)} SQL statements")
print(f"\n--- Sample satellites imported ---")
for i, (norad_id, sat) in enumerate(list(satellites_data.items())[:10]):
    print(f"{i+1}. {sat['name']} (NORAD: {norad_id})")
