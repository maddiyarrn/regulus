import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { TLEData } from '@/lib/db';
import { computeSatellitePosition, calculateDistance, calculateRelativeVelocity } from '@/lib/orbital';

/**
 * POST /api/collisions/detect - Detect potential collisions between satellites
 * Uses TLE data from Space-Track.org to compute collision risks
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      primarySatelliteId, 
      checkAgainstAll = true,
      secondarySatelliteIds = [],
      timeHorizonHours = 24,
      thresholdKm = 5 
    } = body;

    if (!primarySatelliteId) {
      return NextResponse.json(
        { error: 'primarySatelliteId is required' },
        { status: 400 }
      );
    }

    const primaryTLE = await sql<TLEData[]>`
      SELECT * FROM tle_data 
      WHERE satellite_id = ${primarySatelliteId}
      ORDER BY epoch DESC
      LIMIT 1
    `;

    if (primaryTLE.length === 0) {
      return NextResponse.json(
        { error: 'Primary satellite TLE not found. Please import Space-Track TLE data.' },
        { status: 404 }
      );
    }

    const primary = primaryTLE[0];

    let secondaryTLEs: TLEData[];
    if (checkAgainstAll) {
      secondaryTLEs = await sql<TLEData[]>`
        SELECT DISTINCT ON (satellite_id) *
        FROM tle_data
        WHERE satellite_id != ${primarySatelliteId}
        ORDER BY satellite_id, epoch DESC
      `;
    } else {
      if (secondarySatelliteIds.length === 0) {
        return NextResponse.json(
          { error: 'secondarySatelliteIds required when checkAgainstAll is false' },
          { status: 400 }
        );
      }
      
      secondaryTLEs = await sql<TLEData[]>`
        SELECT DISTINCT ON (satellite_id) *
        FROM tle_data
        WHERE satellite_id = ANY(${secondarySatelliteIds})
        ORDER BY satellite_id, epoch DESC
      `;
    }

    const collisions: Array<{
      secondarySatelliteId: number;
      secondaryNoradId: string;
      tca: Date;
      missDistance: number;
      relativeVelocity: number | null;
      riskLevel: string;
    }> = [];

    const now = new Date();
    const timeSteps = 100; // Check 100 points over the time horizon
    const stepMs = (timeHorizonHours * 60 * 60 * 1000) / timeSteps;

    for (const secondary of secondaryTLEs) {
      let minDistance = Infinity;
      let tcaTime: Date | null = null;
      let minDistanceRelVel: number | null = null;

      for (let i = 0; i < timeSteps; i++) {
        const checkTime = new Date(now.getTime() + i * stepMs);

        const primaryPos = computeSatellitePosition(
          primary.tle_line1,
          primary.tle_line2,
          checkTime
        );

        const secondaryPos = computeSatellitePosition(
          secondary.tle_line1,
          secondary.tle_line2,
          checkTime
        );

        if (!primaryPos || !secondaryPos) continue;

        const distance = calculateDistance(primaryPos, secondaryPos);

        if (distance < minDistance) {
          minDistance = distance;
          tcaTime = checkTime;
        }
      }

      if (minDistance < thresholdKm && tcaTime) {
        const relVel = calculateRelativeVelocity(
          primary.tle_line1,
          primary.tle_line2,
          secondary.tle_line1,
          secondary.tle_line2,
          tcaTime
        );

        minDistanceRelVel = relVel;

        let riskLevel = 'LOW';
        if (minDistance < 1) riskLevel = 'CRITICAL';
        else if (minDistance < 2) riskLevel = 'HIGH';
        else if (minDistance < 3) riskLevel = 'MEDIUM';

        collisions.push({
          secondarySatelliteId: secondary.satellite_id,
          secondaryNoradId: secondary.norad_id,
          tca: tcaTime,
          missDistance: minDistance,
          relativeVelocity: minDistanceRelVel,
          riskLevel,
        });

        const primarySatInfo = await sql`
          SELECT * FROM satellites WHERE id = ${primarySatelliteId}
        `;

        const primaryPos = computeSatellitePosition(
          primary.tle_line1,
          primary.tle_line2,
          tcaTime
        );

        const secondaryPos = computeSatellitePosition(
          secondary.tle_line1,
          secondary.tle_line2,
          tcaTime
        );

        await sql`
          INSERT INTO collision_risks (
            primary_satellite_id, primary_norad_id,
            secondary_satellite_id, secondary_norad_id,
            tca, probability, miss_distance, relative_velocity,
            primary_position_x, primary_position_y, primary_position_z,
            secondary_position_x, secondary_position_y, secondary_position_z,
            risk_level, requires_maneuver, status, data_source
          )
          VALUES (
            ${primarySatelliteId}, ${primary.norad_id},
            ${secondary.satellite_id}, ${secondary.norad_id},
            ${tcaTime.toISOString()}, ${null}, ${minDistance}, ${relVel},
            ${primaryPos?.x}, ${primaryPos?.y}, ${primaryPos?.z},
            ${secondaryPos?.x}, ${secondaryPos?.y}, ${secondaryPos?.z},
            ${riskLevel}, ${riskLevel === 'CRITICAL' || riskLevel === 'HIGH'}, 'ACTIVE',
            'Space-Track CDM Analysis'
          )
          ON CONFLICT DO NOTHING
        `;
      }
    }

    return NextResponse.json({
      primarySatelliteId,
      primaryNoradId: primary.norad_id,
      collisionsDetected: collisions.length,
      collisions,
      timeHorizonHours,
      thresholdKm,
      dataSource: 'Space-Track.org TLE',
      message: collisions.length > 0 
        ? `Detected ${collisions.length} potential collision(s)` 
        : 'No collisions detected within threshold',
    });
  } catch (error) {
    console.error('[v0] Collision detection error:', error);
    return NextResponse.json(
      { error: 'Failed to detect collisions' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/collisions/detect - Get collision detection info
 */
export async function GET() {
  return NextResponse.json({
    message: 'Collision Detection API',
    description: 'Analyzes TLE data from Space-Track.org to detect potential satellite collisions',
    dataSource: 'Space-Track.org',
    usage: {
      method: 'POST',
      body: {
        primarySatelliteId: 'number (required)',
        checkAgainstAll: 'boolean (default: true)',
        secondarySatelliteIds: 'number[] (required if checkAgainstAll is false)',
        timeHorizonHours: 'number (default: 24)',
        thresholdKm: 'number (default: 5)',
      },
    },
  });
}
