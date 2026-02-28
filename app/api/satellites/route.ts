import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let satellites;

    if (search) {
      satellites = await sql`
        SELECT s.id, s.name, s.norad_id,
          COALESCE(NULLIF(TRIM(s.object_type), ''), 'UNKNOWN') AS object_type,
          COALESCE(NULLIF(TRIM(s.country), ''), 'Unknown') AS country,
          s.launch_date, s.decay_date, s.is_active, s.international_designator,
          t.tle_line1, t.tle_line2
        FROM satellites s
        LEFT JOIN LATERAL (
          SELECT tle_line1, tle_line2 FROM tle_data WHERE satellite_id = s.id ORDER BY epoch DESC NULLS LAST LIMIT 1
        ) t ON true
        WHERE s.name ILIKE ${`%${search}%`} OR s.norad_id ILIKE ${`%${search}%`}
        ORDER BY s.name
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    } else {
      satellites = await sql`
        SELECT s.id, s.name, s.norad_id,
          COALESCE(NULLIF(TRIM(s.object_type), ''), 'UNKNOWN') AS object_type,
          COALESCE(NULLIF(TRIM(s.country), ''), 'Unknown') AS country,
          s.launch_date, s.decay_date, s.is_active, s.international_designator,
          t.tle_line1, t.tle_line2
        FROM satellites s
        LEFT JOIN LATERAL (
          SELECT tle_line1, tle_line2 FROM tle_data WHERE satellite_id = s.id ORDER BY epoch DESC NULLS LAST LIMIT 1
        ) t ON true
        ORDER BY s.name
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    }

    return NextResponse.json({
      satellites,
      dataSource: 'Space-Track.org',
    });
  } catch (error) {
    console.error('[v0] Error fetching satellites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch satellites' },
      { status: 500 }
    );
  }
}
