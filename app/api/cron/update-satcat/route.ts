import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loginSpaceTrack, fetchSpaceTrack, buildSATCATQuery } from '@/lib/space-track';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();
  const startTime = Date.now();
  let updated = 0;
  let errors = 0;

  try {
    const cookie = await loginSpaceTrack();

    // Get tracked satellites
    const tracked = await sql`SELECT norad_id FROM satellites`;
    const noradIds = tracked.map((r: any) => parseInt(r.norad_id)).filter(Boolean);

    if (noradIds.length === 0) {
      return NextResponse.json({ success: true, message: 'No satellites tracked' });
    }

    const records = await fetchSpaceTrack(cookie, buildSATCATQuery(noradIds));

    for (const record of records) {
      try {
        await sql`
          UPDATE satellites SET
            name        = ${record.OBJECT_NAME || record.SATNAME},
            country     = ${record.COUNTRY || 'Unknown'},
            launch_date = ${record.LAUNCH || null},
            object_type = ${record.OBJECT_TYPE || 'UNKNOWN'},
            updated_at  = CURRENT_TIMESTAMP
          WHERE norad_id = ${record.NORAD_CAT_ID}
        `;
        updated++;
      } catch { errors++; }
    }

    await sql`
      INSERT INTO data_imports (import_type, status, records_updated, records_failed, source_url, notes)
      VALUES ('CRON_SATCAT_DAILY', 'SUCCESS', ${updated}, ${errors},
        'https://www.space-track.org', ${'SATCAT daily update after 17:00 UTC. Duration: ' + (Date.now() - startTime) + 'ms'})
    `;

    return NextResponse.json({ success: true, source: 'Space-Track.org SATCAT', stats: { updated, errors, duration_ms: Date.now() - startTime } });
  } catch (error) {
    await sql`
      INSERT INTO data_imports (import_type, status, records_failed, source_url, notes)
      VALUES ('CRON_SATCAT_DAILY', 'FAILED', 0, 'https://www.space-track.org', ${String(error)})
    `.catch(() => {});
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
