import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/collisions - Get collision risks
 * Data from Space-Track.org CDM analysis
 */
export async function GET(request: Request) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'ACTIVE';
    const riskLevel = searchParams.get('riskLevel');
    const satelliteId = searchParams.get('satelliteId');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = `
      SELECT 
        cr.*,
        ps.name as primary_name,
        ss.name as secondary_name
      FROM collision_risks cr
      LEFT JOIN satellites ps ON cr.primary_satellite_id = ps.id
      LEFT JOIN satellites ss ON cr.secondary_satellite_id = ss.id
      WHERE cr.status = $1
    `;

    const params: (string | number)[] = [status];
    let paramIndex = 2;

    if (riskLevel) {
      query += ` AND cr.risk_level = $${paramIndex}`;
      params.push(riskLevel);
      paramIndex++;
    }

    if (satelliteId) {
      query += ` AND (cr.primary_satellite_id = $${paramIndex} OR cr.secondary_satellite_id = $${paramIndex})`;
      params.push(parseInt(satelliteId));
      paramIndex++;
    }

    query += ` ORDER BY cr.tca ASC LIMIT $${paramIndex}`;
    params.push(limit);

    const collisions = await sql(query, params);

    return NextResponse.json({
      collisions,
      dataSource: 'Space-Track.org CDM',
      count: collisions.length,
    });
  } catch (error) {
    console.error('[v0] Error fetching collisions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collision risks' },
      { status: 500 }
    );
  }
}
