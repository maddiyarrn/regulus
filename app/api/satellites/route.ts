import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { Satellite } from '@/lib/db';

/**
 * GET /api/satellites - Get all satellites
 * Data sourced from Space-Track.org
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const isActive = searchParams.get('isActive');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = sql`
      SELECT * FROM satellites
      WHERE 1=1
    `;

    if (search) {
      query = sql`
        SELECT * FROM satellites
        WHERE (name ILIKE ${`%${search}%`} OR norad_id ILIKE ${`%${search}%`})
      `;
    }

    if (isActive !== null) {
      const active = isActive === 'true';
      query = sql`
        SELECT * FROM satellites
        WHERE is_active = ${active}
        ${search ? sql`AND (name ILIKE ${`%${search}%`} OR norad_id ILIKE ${`%${search}%`})` : sql``}
      `;
    }

    const satellites = await sql<Satellite[]>`
      ${query}
      ORDER BY name
      LIMIT ${limit}
      OFFSET ${offset}
    `;

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
