import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { Satellite, TLEData } from '@/lib/db';

/**
 * GET /api/satellites/[id] - Get satellite details with latest TLE
 * TLE data from Space-Track.org
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const satelliteId = parseInt(id);

    if (isNaN(satelliteId)) {
      return NextResponse.json(
        { error: 'Invalid satellite ID' },
        { status: 400 }
      );
    }

    const satellites = await sql<Satellite[]>`
      SELECT * FROM satellites WHERE id = ${satelliteId}
    `;

    if (satellites.length === 0) {
      return NextResponse.json(
        { error: 'Satellite not found' },
        { status: 404 }
      );
    }

    const satellite = satellites[0];

    const tleData = await sql<TLEData[]>`
      SELECT * FROM tle_data 
      WHERE satellite_id = ${satelliteId}
      ORDER BY epoch DESC
      LIMIT 1
    `;

    return NextResponse.json({
      satellite,
      tle: tleData[0] || null,
      dataSource: 'Space-Track.org',
    });
  } catch (error) {
    console.error('[v0] Error fetching satellite:', error);
    return NextResponse.json(
      { error: 'Failed to fetch satellite' },
      { status: 500 }
    );
  }
}
