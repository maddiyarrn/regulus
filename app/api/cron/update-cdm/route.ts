import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loginSpaceTrack, fetchSpaceTrack, buildCDMQuery } from '@/lib/space-track';

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
    const records = await fetchSpaceTrack(cookie, buildCDMQuery());

    for (const cdm of records) {
      try {
        const primary = await sql`SELECT id FROM satellites WHERE norad_id = ${cdm.SAT_1_ID} LIMIT 1`;
        const secondary = await sql`SELECT id FROM satellites WHERE norad_id = ${cdm.SAT_2_ID} LIMIT 1`;

        if (primary.length === 0 || secondary.length === 0) continue;

        const missDistance = parseFloat(cdm.MISS_DISTANCE || '999999');
        const probability = parseFloat(cdm.COLLISION_PROBABILITY || '0');

        let riskLevel = 'LOW';
        if (missDistance < 0.2) riskLevel = 'CRITICAL';
        else if (missDistance < 1) riskLevel = 'HIGH';
        else if (missDistance < 5) riskLevel = 'MEDIUM';

        await sql`
          INSERT INTO collision_risks (
            primary_satellite_id, secondary_satellite_id,
            tca, miss_distance, probability_of_collision,
            relative_velocity, risk_level, status,
            data_source, notes
          ) VALUES (
            ${primary[0].id}, ${secondary[0].id},
            ${cdm.TCA || null},
            ${missDistance},
            ${probability},
            ${parseFloat(cdm.RELATIVE_VELOCITY || '0')},
            ${riskLevel}, 'ACTIVE',
            'Space-Track.org CDM',
            ${`CDM ID: ${cdm.CDM_ID || 'N/A'} | Obj1: ${cdm.SAT_1_NAME} | Obj2: ${cdm.SAT_2_NAME}`}
          )
          ON CONFLICT DO NOTHING
        `;
        imported++;
      } catch { errors++; }
    }

    await sql`
      INSERT INTO data_imports (import_type, status, records_imported, records_failed, source_url, notes)
      VALUES ('CRON_CDM_8H', 'SUCCESS', ${imported}, ${errors},
        'https://www.space-track.org', ${'CDM update every 8h. Duration: ' + (Date.now() - startTime) + 'ms'})
    `;

    return NextResponse.json({ success: true, source: 'Space-Track.org CDM', stats: { imported, errors, duration_ms: Date.now() - startTime } });
  } catch (error) {
    await sql`
      INSERT INTO data_imports (import_type, status, records_failed, source_url, notes)
      VALUES ('CRON_CDM_8H', 'FAILED', 0, 'https://www.space-track.org', ${String(error)})
    `.catch(() => {});
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
