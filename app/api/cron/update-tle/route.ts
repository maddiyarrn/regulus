import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const TRACKED_NORAD_IDS = [
  25544,  // ISS
  48274,  // Tiangong
  20580,  // Hubble Space Telescope
  41328,  // GPS NAVSTAR 76
  43689,  // METOP-C
  44713,  // STARLINK-1007
  44714,  // STARLINK-1008
  44715,  // STARLINK-1009
  44716,  // STARLINK-1010
  44717,  // STARLINK-1011
  28361,  // GLONASS 730
  40889,  // GLONASS-M 61
  43873,  // GLONASS-K2
  43690,  // OneWeb-0082
  37820,  // COSMOS 2542
];

async function fetchFromSpaceTrack(login: string, password: string, noradIds: number[]) {
  const loginRes = await fetch('https://www.space-track.org/ajaxauth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `identity=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`,
  });

  if (!loginRes.ok) {
    throw new Error(`Space-Track login failed: ${loginRes.status}`);
  }

  const setCookie = loginRes.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('No session cookie returned from Space-Track');
  }
  const cookieMatch = setCookie.match(/chocolatechip=[^;]+/);
  const cookie = cookieMatch ? cookieMatch[0] : '';

  const ids = noradIds.join(',');
  const dataRes = await fetch(
    `https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/${ids}/orderby/NORAD_CAT_ID/format/json`,
    {
      headers: { Cookie: cookie },
    }
  );

  if (!dataRes.ok) {
    throw new Error(`Space-Track data fetch failed: ${dataRes.status}`);
  }

  return dataRes.json();
}

function parseSpaceTrackRecord(record: Record<string, string>) {
  return {
    norad_id: record.NORAD_CAT_ID,
    name: record.OBJECT_NAME,
    country: record.COUNTRY_CODE || 'Unknown',
    launch_date: record.LAUNCH_DATE || null,
    object_type: record.OBJECT_TYPE || 'UNKNOWN',
    epoch: record.EPOCH,
    mean_motion: parseFloat(record.MEAN_MOTION),
    eccentricity: parseFloat(record.ECCENTRICITY),
    inclination: parseFloat(record.INCLINATION),
    right_ascension: parseFloat(record.RA_OF_ASC_NODE),
    argument_of_perigee: parseFloat(record.ARG_OF_PERICENTER),
    mean_anomaly: parseFloat(record.MEAN_ANOMALY),
    bstar: parseFloat(record.BSTAR),
    tle_line1: record.TLE_LINE1,
    tle_line2: record.TLE_LINE2,
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const login = process.env.SPACE_TRACK_LOGIN;
  const password = process.env.SPACE_TRACK_PASSWORD;

  if (!login || !password) {
    return NextResponse.json(
      { error: 'SPACE_TRACK_LOGIN and SPACE_TRACK_PASSWORD environment variables are required' },
      { status: 500 }
    );
  }

  const sql = getDb();
  const startTime = Date.now();
  let imported = 0;
  let updated = 0;
  let errors = 0;

  try {
    const records = await fetchFromSpaceTrack(login, password, TRACKED_NORAD_IDS);

    for (const record of records) {
      try {
        const parsed = parseSpaceTrackRecord(record);

        const satResult = await sql`
          INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
          VALUES (
            ${parsed.norad_id},
            ${parsed.name},
            ${parsed.country},
            ${parsed.launch_date},
            ${parsed.object_type},
            'Space-Track.org'
          )
          ON CONFLICT (norad_id) DO UPDATE SET
            name = EXCLUDED.name,
            country = EXCLUDED.country,
            object_type = EXCLUDED.object_type,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id, (xmax = 0) AS is_new
        `;

        const satelliteId = satResult[0].id;
        const isNew = satResult[0].is_new;
        if (isNew) imported++; else updated++;

        if (parsed.tle_line1 && parsed.tle_line2) {
          await sql`
            INSERT INTO tle_data (
              satellite_id, norad_id, epoch,
              mean_motion, eccentricity, inclination,
              right_ascension, argument_of_perigee, mean_anomaly,
              bstar, tle_line1, tle_line2, data_source
            )
            VALUES (
              ${satelliteId}, ${parsed.norad_id}, ${parsed.epoch},
              ${parsed.mean_motion}, ${parsed.eccentricity}, ${parsed.inclination},
              ${parsed.right_ascension}, ${parsed.argument_of_perigee}, ${parsed.mean_anomaly},
              ${parsed.bstar}, ${parsed.tle_line1}, ${parsed.tle_line2}, 'Space-Track.org'
            )
            ON CONFLICT DO NOTHING
          `;
        }
      } catch (recordError) {
        console.error(`[cron] Error processing NORAD ${record.NORAD_CAT_ID}:`, recordError);
        errors++;
      }
    }

    await sql`
      INSERT INTO data_imports (
        import_type, status, records_imported, records_updated,
        records_failed, source_url, notes
      ) VALUES (
        'CRON_TLE_UPDATE',
        'SUCCESS',
        ${imported},
        ${updated},
        ${errors},
        'https://www.space-track.org',
        ${'Auto-update via Vercel Cron. Duration: ' + (Date.now() - startTime) + 'ms'}
      )
    `;

    return NextResponse.json({
      success: true,
      message: 'TLE data updated from Space-Track.org',
      stats: {
        new_satellites: imported,
        updated_satellites: updated,
        errors,
        duration_ms: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[cron] TLE update failed:', error);

    await sql`
      INSERT INTO data_imports (import_type, status, records_failed, source_url, notes)
      VALUES (
        'CRON_TLE_UPDATE', 'FAILED', 0,
        'https://www.space-track.org',
        ${String(error)}
      )
    `.catch(() => {});

    return NextResponse.json(
      { error: 'TLE update failed', details: String(error) },
      { status: 500 }
    );
  }
}
