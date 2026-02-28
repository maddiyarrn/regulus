
"""
Bulk import script for Space-Track.org CSV files into SQL INSERT statements.
This script processes all CSV files and generates a single SQL file for import.
"""

import csv
import os
from datetime import datetime

csv_files = [
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_2124166857-WQe22.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_900563210-PQmga.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_1824680724-Vf4Zi.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_1437434851-IwJEV.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_2124166857-xhvNx.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_924961025-mipSv.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_741633971-0Ywee.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_2103780175-TSPrc.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_1555914956-nfUND.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_934842541-ieUb5.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_958559446-b1K0E.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260222_2103780175-k6ZMk.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_758702183-IFgGq.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_262211961-lDxaE.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_1482045168-bf3eZ.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_73583231-n5THP.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_402957178-TfMrJ.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_1043687830-8oEKR.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_1268969675-UoXIY.csv",
    "user_read_only_context/text_attachments/st_nauruzbekov_mail@inbox_ru_20260221_8737112-aO4nV.csv",
]

def sql_escape(value):
    """Escape single quotes for SQL"""
    if value is None:
        return 'NULL'
    return str(value).replace("'", "''")

def parse_epoch(epoch_str):
    """Parse epoch string to SQL timestamp"""
    try:
        dt = datetime.strptime(epoch_str[:19], "%Y-%m-%dT%H:%M:%S")
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return epoch_str

satellites = []
tle_records = []

print("Processing CSV files...")

for csv_file in csv_files:
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                norad_id = row.get('NORAD_CAT_ID', '')
                if not norad_id:
                    continue
                
                sat = {
                    'norad_id': norad_id,
                    'name': sql_escape(row.get('OBJECT_NAME', '')),
                    'country': sql_escape(row.get('COUNTRY_CODE', 'Unknown')),
                    'launch_date': row.get('LAUNCH_DATE', 'NULL'),
                    'object_type': sql_escape(row.get('OBJECT_TYPE', 'UNKNOWN')),
                }
                
                tle = {
                    'norad_id': norad_id,
                    'epoch': parse_epoch(row.get('EPOCH', '')),
                    'mean_motion': row.get('MEAN_MOTION', '0'),
                    'eccentricity': row.get('ECCENTRICITY', '0'),
                    'inclination': row.get('INCLINATION', '0'),
                    'right_ascension': row.get('RA_OF_ASC_NODE', '0'),
                    'argument_of_perigee': row.get('ARG_OF_PERICENTER', '0'),
                    'mean_anomaly': row.get('MEAN_ANOMALY', '0'),
                    'tle_line1': sql_escape(row.get('TLE_LINE1', '')),
                    'tle_line2': sql_escape(row.get('TLE_LINE2', '')),
                    'bstar': row.get('BSTAR', '0'),
                }
                
                satellites.append(sat)
                tle_records.append(tle)
        
        print(f"✓ Processed {csv_file}")
    except Exception as e:
        print(f"✗ Error processing {csv_file}: {e}")

print(f"\nTotal satellites found: {len(satellites)}")
print(f"Total TLE records: {len(tle_records)}")

output_file = "scripts/005-bulk-insert-satellites.sql"
with open(output_file, 'w', encoding='utf-8') as f:
    f.write("-- Bulk import of satellites from Space-Track.org CSV files\n")
    f.write("-- Generated: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "\n")
    f.write(f"-- Source: {len(csv_files)} CSV files\n")
    f.write(f"-- Total satellites: {len(satellites)}\n\n")
    
    for sat in satellites:
        launch_date = f"'{sat['launch_date']}'" if sat['launch_date'] != 'NULL' else 'NULL'
        sql = f"""INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
VALUES ('{sat['norad_id']}', '{sat['name']}', '{sat['country']}', {launch_date}, '{sat['object_type']}', 'Space-Track.org')
ON CONFLICT (norad_id) DO UPDATE SET
    name = EXCLUDED.name,
    country = EXCLUDED.country,
    object_type = EXCLUDED.object_type,
    updated_at = CURRENT_TIMESTAMP;

"""
        f.write(sql)
    
    for tle in tle_records:
        sql = f"""INSERT INTO tle_data (satellite_id, norad_id, epoch, mean_motion, eccentricity, inclination, right_ascension, argument_of_perigee, mean_anomaly, tle_line1, tle_line2, bstar, data_source)
SELECT s.id, '{tle['norad_id']}', '{tle['epoch']}', {tle['mean_motion']}, {tle['eccentricity']}, {tle['inclination']}, {tle['right_ascension']}, {tle['argument_of_perigee']}, {tle['mean_anomaly']}, '{tle['tle_line1']}', '{tle['tle_line2']}', {tle['bstar']}, 'Space-Track.org'
FROM satellites s WHERE s.norad_id = '{tle['norad_id']}'
ON CONFLICT (satellite_id, epoch) DO NOTHING;

"""
        f.write(sql)

print(f"\n✓ SQL file generated: {output_file}")
print("Ready to execute!")
