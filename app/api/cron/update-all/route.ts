import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loginSpaceTrack, fetchSpaceTrack, buildGPQuery, buildCDMQuery, buildSATCATQuery, buildTIPQuery } from '@/lib/space-track';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();
  const startTime = Date.now();
  const results: Record<string, { imported?: number; updated?: number; errors?: number; skipped?: boolean; error?: string }> = {};

  let cookie: string;
  try {
    cookie = await loginSpaceTrack();
  } catch (error) {
    return NextResponse.json({ error: 'Space-Track login failed', details: String(error) }, { status: 500 });
  }

  const tracked = await sql`SELECT norad_id FROM satellites`;
  const noradIds = tracked.map((r: { norad_id: string }) => parseInt(r.norad_id)).filter(Boolean);

  try {
    let updated = 0, errors = 0;
    if (noradIds.length > 0) {
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
    }
    results.satcat = { updated, errors };
  } catch (error) {
    results.satcat = { error: String(error) };
  }

  try {
    let imported = 0, errors = 0;
    if (noradIds.length > 0) {
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
              name = EXCLUDED.name,
              country = EXCLUDED.country,
              object_type = EXCLUDED.object_type,
              updated_at = CURRENT_TIMESTAMP
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
    } else {
      results.gp = { skipped: true };
    }
    if (noradIds.length > 0) results.gp = { imported, errors };
  } catch (error) {
    results.gp = { error: String(error) };
  }

  try {
    let imported = 0, errors = 0;
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
            relative_velocity, risk_level, status, data_source, notes
          ) VALUES (
            ${primary[0].id}, ${secondary[0].id},
            ${cdm.TCA || null}, ${missDistance}, ${probability},
            ${parseFloat(cdm.RELATIVE_VELOCITY || '0')},
            ${riskLevel}, 'ACTIVE', 'Space-Track.org CDM',
            ${`CDM: ${cdm.CDM_ID || 'N/A'} | ${cdm.SAT_1_NAME} / ${cdm.SAT_2_NAME}`}
          )
          ON CONFLICT DO NOTHING
        `;
        imported++;
      } catch { errors++; }
    }
    results.cdm = { imported, errors };
  } catch (error) {
    results.cdm = { error: String(error) };
  }

  try {
    let imported = 0;
    const records = await fetchSpaceTrack(cookie, buildTIPQuery());
    for (const tip of records) {
      try {
        const sat = await sql`SELECT id FROM satellites WHERE norad_id = ${tip.NORAD_CAT_ID} LIMIT 1`;
        if (sat.length === 0) continue;
        await sql`
          INSERT INTO collision_risks (
            primary_satellite_id, secondary_satellite_id,
            tca, miss_distance, risk_level, status, data_source, notes
          ) VALUES (
            ${sat[0].id}, ${sat[0].id},
            ${tip.DECAY_EPOCH || null}, 0, 'HIGH', 'ACTIVE',
            'Space-Track.org TIP',
            ${`Re-entry: ${tip.OBJECT_NAME || tip.NORAD_CAT_ID}. Window: ${tip.WINDOW || 'N/A'} min`}
          )
          ON CONFLICT DO NOTHING
        `;
        imported++;
      } catch { /* skip */ }
    }
    results.tip = { imported };
  } catch (error) {
    results.tip = { error: String(error) };
  }

  const duration = Date.now() - startTime;
  await sql`
    INSERT INTO data_imports (import_type, status, records_imported, source_url, notes)
    VALUES (
      'CRON_UPDATE_ALL', 'SUCCESS',
      ${(results.gp?.imported ?? 0) + (results.cdm?.imported ?? 0) + (results.tip?.imported ?? 0)},
      'https://www.space-track.org',
      ${`Daily update-all. Duration: ${duration}ms. Results: ${JSON.stringify(results)}`}
    )
  `.catch(() => {});

  return NextResponse.json({
    success: true,
    duration_ms: duration,
    results,
  });
}
