import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateOrbitPath } from '@/lib/orbital';

/**
 * GET /api/satellites/[id]/orbit - Generate orbital path for visualization
 * Uses TLE data from Space-Track.org
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;
    const satelliteId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const durationMinutes = parseInt(searchParams.get('duration') || '90');
    const steps = parseInt(searchParams.get('steps') || '100');

    if (isNaN(satelliteId)) {
      return NextResponse.json(
        { error: 'Invalid satellite ID' },
        { status: 400 }
      );
    }

    const tleData = await sql`
      SELECT * FROM tle_data 
      WHERE satellite_id = ${satelliteId}
      ORDER BY epoch DESC
      LIMIT 1
    `;

    if (tleData.length === 0) {
      return NextResponse.json(
        { error: 'No TLE data available for this satellite. Please provide Space-Track TLE data.' },
        { status: 404 }
      );
    }

    const tle = tleData[0];
    
    const startDate = new Date();
    const orbitPath = generateOrbitPath(
      tle.tle_line1,
      tle.tle_line2,
      startDate,
      durationMinutes,
      steps
    );

    return NextResponse.json({
      orbitPath,
      satellite_id: satelliteId,
      norad_id: tle.norad_id,
      epoch: tle.epoch,
      durationMinutes,
      steps,
      dataSource: 'Space-Track.org TLE',
    });
  } catch (error) {
    console.error('[v0] Error generating orbit path:', error);
    return NextResponse.json(
      { error: 'Failed to generate orbit path' },
      { status: 500 }
    );
  }
}
