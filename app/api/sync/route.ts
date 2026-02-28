import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { cookies } from 'next/headers';

const TRACKED_NORAD_IDS = [
  25544, 48274, 20580, 41328, 43689,
  44713, 44714, 44715, 44716, 44717,
  28361, 40889, 43873, 43690, 37820,
];

async function fetchFromSpaceTrack(login: string, password: string, noradIds: number[]) {
  const loginRes = await fetch('https://www.space-track.org/ajaxauth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `identity=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`,
  });

  if (!loginRes.ok) throw new Error(`Space-Track login failed: ${loginRes.status}`);

  const setCookie = loginRes.headers.get('set-cookie') || '';
  const cookieMatch = setCookie.match(/chocolatechip=[^;]+/);
  const cookie = cookieMatch ? cookieMatch[0] : '';

  const ids = noradIds.join(',');
  const dataRes = await fetch(
    `https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/${ids}/orderby/NORAD_CAT_ID/format/json`,
    { headers: { Cookie: cookie } }
  );

  if (!dataRes.ok) throw new Error(`Space-Track fetch failed: ${dataRes.status}`);
  return dataRes.json();
}

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const user = await getSession(token);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const login = process.env.SPACE_TRACK_LOGIN;
  const password = process.env.SPACE_TRACK_PASSWORD;

  if (!login || !password) {
    return NextResponse.json(
      { error: 'SPACE_TRACK_LOGIN and SPACE_TRACK_PASSWORD are not configured. Please add them in the Vars section.' },
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
        const satResult = await sql`
          INSERT INTO satellites (norad_id, name, country, launch_date, object_type, data_source)
          VALUES (
            ${record.NORAD_CAT_ID},
            ${record.OBJECT_NAME},
            ${record.COUNTRY_CODE || 'Unknown'},
            ${record.LAUNCH_DATE || null},
            ${record.OBJECT_TYPE || 'UNKNOWN'},
            'Space-Track.org'
          )
          ON CONFLICT (norad_id) DO UPDATE SET
            name = EXCLUDED.name,
            country = EXCLUDED.country,
            object_type = EXCLUDED.object_type,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `;

        const satelliteId = satResult[0].id;
        imported++;

        if (record.TLE_LINE1 && record.TLE_LINE2) {
          await sql`
            INSERT INTO tle_data (
              satellite_id, norad_id, epoch,
              mean_motion, eccentricity, inclination,
              right_ascension, argument_of_perigee, mean_anomaly,
              bstar, tle_line1, tle_line2, data_source
            )
            VALUES (
              ${satelliteId}, ${record.NORAD_CAT_ID}, ${record.EPOCH},
              ${parseFloat(record.MEAN_MOTION)}, ${parseFloat(record.ECCENTRICITY)},
              ${parseFloat(record.INCLINATION)}, ${parseFloat(record.RA_OF_ASC_NODE)},
              ${parseFloat(record.ARG_OF_PERICENTER)}, ${parseFloat(record.MEAN_ANOMALY)},
              ${parseFloat(record.BSTAR)}, ${record.TLE_LINE1}, ${record.TLE_LINE2},
              'Space-Track.org'
            )
            ON CONFLICT DO NOTHING
          `;
        }
      } catch (e) {
        errors++;
      }
    }

    await sql`
      INSERT INTO data_imports (import_type, status, records_imported, records_updated, records_failed, source_url, notes)
      VALUES ('MANUAL_SYNC', 'SUCCESS', ${imported}, ${updated}, ${errors},
        'https://www.space-track.org',
        ${'Manual sync by user. Duration: ' + (Date.now() - startTime) + 'ms'})
    `;

    return NextResponse.json({
      success: true,
      stats: { imported, updated, errors, duration_ms: Date.now() - startTime },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
