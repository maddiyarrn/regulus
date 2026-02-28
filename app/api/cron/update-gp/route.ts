import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loginSpaceTrack, fetchSpaceTrack, buildGPQuery } from '@/lib/space-track';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();
  const startTime = Date.now();
  let imported = 0;
  let errors = 0;

  try {
    const cookie = await loginSpaceTrack();

    const tracked = await sql`SELECT norad_id FROM satellites`;
    const noradIds = tracked.map((r: any) => parseInt(r.norad_id)).filter(Boolean);

    if (noradIds.length === 0) {
      return NextResponse.json({ success: true, message: 'No satellites tracked yet', stats: { imported: 0 } });
    }

    const records = await fetchSpaceTrack(cookie, buildGPQuery(noradIds));

    for (const record of records) {
      try {
        const satResult = await sql`
          INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
          VALUES (
            ${record.NORAD_CAT_ID}, ${record.OBJECT_NAME},
            ${record.COUNTRY_CODE || 'Unknown'}, ${record.LAUNCH_DATE || null},
            ${record.OBJECT_TYPE || 'UNKNOWN'}, 'Space-Track.org'
          )
          ON CONFLICT (norad_id) DO UPDATE SET
            name = EXCLUDED.name, country = EXCLUDED.country,
            object_type = EXCLUDED.object_type, updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `;

        if (record.TLE_LINE1 && record.TLE_LINE2) {
          await sql`
            INSERT INTO tle_data (
              satellite_id, norad_id, epoch, mean_motion, eccentricity,
              inclination, right_ascension, argument_of_perigee, mean_anomaly,
              bstar, tle_line1, tle_line2, data_source
            ) VALUES (
              ${satResult[0].id}, ${record.NORAD_CAT_ID}, ${record.EPOCH},
              ${parseFloat(record.MEAN_MOTION)}, ${parseFloat(record.ECCENTRICITY)},
              ${parseFloat(record.INCLINATION)}, ${parseFloat(record.RA_OF_ASC_NODE)},
              ${parseFloat(record.ARG_OF_PERICENTER)}, ${parseFloat(record.MEAN_ANOMALY)},
              ${parseFloat(record.BSTAR)}, ${record.TLE_LINE1}, ${record.TLE_LINE2},
              'Space-Track.org'
            )
            ON CONFLICT DO NOTHING
          `;
          imported++;
        }
      } catch { errors++; }
    }

    await sql`
      INSERT INTO data_imports (import_type, status, records_imported, records_failed, source_url, notes)
      VALUES ('CRON_GP_HOURLY', 'SUCCESS', ${imported}, ${errors},
        'https://www.space-track.org', ${'GP/TLE hourly update. Duration: ' + (Date.now() - startTime) + 'ms'})
    `;

    return NextResponse.json({ success: true, source: 'Space-Track.org', stats: { imported, errors, duration_ms: Date.now() - startTime } });
  } catch (error) {
    await sql`
      INSERT INTO data_imports (import_type, status, records_failed, source_url, notes)
      VALUES ('CRON_GP_HOURLY', 'FAILED', 0, 'https://www.space-track.org', ${String(error)})
    `.catch(() => {});
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
