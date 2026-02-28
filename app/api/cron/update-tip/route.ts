import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loginSpaceTrack, fetchSpaceTrack, buildTIPQuery } from '@/lib/space-track';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();
  const startTime = Date.now();
  let imported = 0;

  try {
    const cookie = await loginSpaceTrack();
    const records = await fetchSpaceTrack(cookie, buildTIPQuery());

    for (const tip of records) {
      try {
        const sat = await sql`SELECT id FROM satellites WHERE norad_id = ${tip.NORAD_CAT_ID} LIMIT 1`;
        if (sat.length === 0) continue;

        await sql`
          INSERT INTO collision_risks (
            primary_satellite_id, secondary_satellite_id,
            tca, miss_distance, risk_level, status,
            data_source, notes
          ) VALUES (
            ${sat[0].id}, ${sat[0].id},
            ${tip.DECAY_EPOCH || null},
            0,
            'HIGH', 'ACTIVE',
            'Space-Track.org TIP',
            ${`Re-entry prediction. Object: ${tip.OBJECT_NAME || tip.NORAD_CAT_ID}. Window: ${tip.WINDOW || 'N/A'} min`}
          )
          ON CONFLICT DO NOTHING
        `;
        imported++;
      } catch { /* skip */ }
    }

    await sql`
      INSERT INTO data_imports (import_type, status, records_imported, source_url, notes)
      VALUES ('CRON_TIP_HOURLY', 'SUCCESS', ${imported},
        'https://www.space-track.org', ${'TIP hourly. Duration: ' + (Date.now() - startTime) + 'ms'})
    `;

    return NextResponse.json({ success: true, source: 'Space-Track.org TIP', stats: { imported, duration_ms: Date.now() - startTime } });
  } catch (error) {
    await sql`
      INSERT INTO data_imports (import_type, status, records_failed, source_url, notes)
      VALUES ('CRON_TIP_HOURLY', 'FAILED', 0, 'https://www.space-track.org', ${String(error)})
    `.catch(() => {});
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
