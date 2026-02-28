import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function parseSpaceTrackCSV(csvText: string) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += char; }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    records.push(row);
  }
  return records;
}

function mapRowToSatellite(row: Record<string, string>) {
  const noradId =
    row['NORAD_CAT_ID'] || row['CCSDS_OMM_VERS'] || row['norad_cat_id'] || '';
  const name =
    row['OBJECT_NAME'] || row['object_name'] || row['name'] || `NORAD ${noradId}`;
  const line1 = row['TLE_LINE1'] || row['tle_line1'] || row['LINE1'] || '';
  const line2 = row['TLE_LINE2'] || row['tle_line2'] || row['LINE2'] || '';
  const epoch = row['EPOCH'] || row['epoch'] || '';
  const intlDesig = row['OBJECT_ID'] || row['international_designator'] || '';
  const objectType = row['OBJECT_TYPE'] || row['object_type'] || '';
  const country = row['COUNTRY_CODE'] || row['country'] || '';
  const launchDate = row['LAUNCH_DATE'] || row['launch_date'] || '';
  const inclination = parseFloat(row['INCLINATION'] || row['inclination'] || '0');
  const eccentricity = parseFloat(row['ECCENTRICITY'] || row['eccentricity'] || '0');
  const meanMotion = parseFloat(row['MEAN_MOTION'] || row['mean_motion'] || '0');
  const raan = parseFloat(row['RA_OF_ASC_NODE'] || row['raan'] || '0');
  const argOfPerigee = parseFloat(row['ARG_OF_PERICENTER'] || row['arg_of_pericenter'] || '0');
  const meanAnomaly = parseFloat(row['MEAN_ANOMALY'] || row['mean_anomaly'] || '0');
  const bstar = parseFloat(row['BSTAR'] || row['bstar'] || '0');

  return {
    noradId: noradId.trim(),
    name: name.trim(),
    line1: line1.trim(),
    line2: line2.trim(),
    epoch: epoch.trim(),
    intlDesig: intlDesig.trim(),
    objectType: objectType.trim(),
    country: country.trim(),
    launchDate: launchDate.trim() || null,
    inclination,
    eccentricity,
    meanMotion,
    raan,
    argOfPerigee,
    meanAnomaly,
    bstar,
  };
}

export async function POST(request: Request) {
  try {
    const sql = getDb();
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    let totalImported = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];
    const importStarted = new Date();

    for (const file of files) {
      const text = await file.text();
      const rows = parseSpaceTrackCSV(text);

      for (const row of rows) {
        const sat = mapRowToSatellite(row);

        if (!sat.noradId) {
          totalSkipped++;
          continue;
        }

        try {
          const sats = await sql`
            INSERT INTO satellites (
              norad_id, name, international_designator,
              object_type, country, launch_date, data_source
            ) VALUES (
              ${sat.noradId},
              ${sat.name},
              ${sat.intlDesig || null},
              ${sat.objectType || null},
              ${sat.country || null},
              ${sat.launchDate || null},
              'Space-Track.org'
            )
            ON CONFLICT (norad_id) DO UPDATE SET
              name = EXCLUDED.name,
              updated_at = CURRENT_TIMESTAMP
            RETURNING id
          `;
          const satelliteId = sats[0].id;

          if (sat.line1 && sat.line2) {
            const epochTs = sat.epoch
              ? new Date(sat.epoch).toISOString()
              : new Date().toISOString();

            await sql`
              INSERT INTO tle_data (
                satellite_id, norad_id, epoch,
                inclination, right_ascension, eccentricity,
                argument_of_perigee, mean_anomaly, mean_motion,
                tle_line0, tle_line1, tle_line2, bstar,
                data_source
              ) VALUES (
                ${satelliteId}, ${sat.noradId}, ${epochTs},
                ${sat.inclination}, ${sat.raan}, ${sat.eccentricity},
                ${sat.argOfPerigee}, ${sat.meanAnomaly}, ${sat.meanMotion},
                ${sat.name}, ${sat.line1}, ${sat.line2}, ${sat.bstar},
                'Space-Track.org'
              )
              ON CONFLICT (satellite_id, epoch) DO NOTHING
            `;
          } else if (sat.inclination && sat.meanMotion) {
            const epochTs = sat.epoch
              ? new Date(sat.epoch).toISOString()
              : new Date().toISOString();

            await sql`
              INSERT INTO tle_data (
                satellite_id, norad_id, epoch,
                inclination, right_ascension, eccentricity,
                argument_of_perigee, mean_anomaly, mean_motion,
                tle_line0, bstar, data_source
              ) VALUES (
                ${satelliteId}, ${sat.noradId}, ${epochTs},
                ${sat.inclination}, ${sat.raan}, ${sat.eccentricity},
                ${sat.argOfPerigee}, ${sat.meanAnomaly}, ${sat.meanMotion},
                ${sat.name}, ${sat.bstar},
                'Space-Track.org'
              )
              ON CONFLICT (satellite_id, epoch) DO NOTHING
            `;
          }

          totalImported++;
        } catch (err: any) {
          allErrors.push(`NORAD ${sat.noradId}: ${err.message}`);
          totalSkipped++;
        }
      }
    }

    await sql`
      INSERT INTO data_imports (
        import_type, source, status,
        records_imported, error_message,
        import_started_at, import_completed_at,
        metadata
      ) VALUES (
        'TLE', 'Space-Track.org CSV Upload',
        ${allErrors.length > 0 && totalImported === 0 ? 'FAILED' : allErrors.length > 0 ? 'PARTIAL' : 'SUCCESS'},
        ${totalImported},
        ${allErrors.slice(0, 5).join('; ') || null},
        ${importStarted.toISOString()},
        ${new Date().toISOString()},
        ${JSON.stringify({ files: files.map(f => f.name), skipped: totalSkipped })}
      )
    `;

    return NextResponse.json({
      success: true,
      imported: totalImported,
      skipped: totalSkipped,
      errors: allErrors.slice(0, 10),
      message: `Imported ${totalImported} satellites from ${files.length} file(s)`,
    });
  } catch (err: any) {
    console.error('[v0] CSV import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
