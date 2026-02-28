import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { parseTLEEpoch, extractOrbitalElements } from '@/lib/orbital';

/**
 * POST /api/import/space-track - Import TLE data from Space-Track
 * 
 * This endpoint expects TLE data from Space-Track.org
 * User must provide Space-Track credentials or CSV/TLE files
 * 
 * Request body format:
 * {
 *   "tleData": [
 *     {
 *       "norad_id": "25544",
 *       "name": "ISS (ZARYA)",
 *       "line1": "1 25544U...",
 *       "line2": "2 25544..."
 *     }
 *   ]
 * }
 */
export async function POST(request: Request) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { tleData } = body;

    if (!tleData || !Array.isArray(tleData)) {
      return NextResponse.json(
        { 
          error: 'Invalid request format',
          message: 'Please provide TLE data from Space-Track.org in the correct format',
          expectedFormat: {
            tleData: [
              {
                norad_id: 'string',
                name: 'string',
                line1: 'string (TLE Line 1)',
                line2: 'string (TLE Line 2)',
              }
            ]
          }
        },
        { status: 400 }
      );
    }

    const importStarted = new Date();
    let recordsImported = 0;
    const errors: string[] = [];

    for (const tle of tleData) {
      try {
        const { norad_id, name, line1, line2, international_designator, object_type, country, launch_date } = tle;

        if (!norad_id || !line1 || !line2) {
          errors.push(`Missing required fields for entry: ${JSON.stringify(tle)}`);
          continue;
        }

        const satellites = await sql`
          INSERT INTO satellites (
            norad_id, name, international_designator, 
            object_type, country, launch_date, data_source
          )
          VALUES (
            ${norad_id}, 
            ${name || `NORAD ${norad_id}`}, 
            ${international_designator || null},
            ${object_type || null},
            ${country || null},
            ${launch_date || null},
            'Space-Track'
          )
          ON CONFLICT (norad_id) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `;

        const satelliteId = satellites[0].id;

        const epoch = parseTLEEpoch(line1);
        const elements = extractOrbitalElements(line1, line2);

        if (!epoch || !elements) {
          errors.push(`Failed to parse TLE for NORAD ${norad_id}`);
          continue;
        }

        await sql`
          INSERT INTO tle_data (
            satellite_id, norad_id, epoch,
            inclination, right_ascension, eccentricity,
            argument_of_perigee, mean_anomaly, mean_motion,
            tle_line0, tle_line1, tle_line2,
            data_source
          )
          VALUES (
            ${satelliteId}, ${norad_id}, ${epoch.toISOString()},
            ${elements.inclination}, ${elements.rightAscension}, ${elements.eccentricity},
            ${elements.argumentOfPerigee}, ${elements.meanAnomaly}, ${elements.meanMotion},
            ${name || null}, ${line1}, ${line2},
            'Space-Track'
          )
          ON CONFLICT (satellite_id, epoch) DO NOTHING
        `;

        recordsImported++;
      } catch (error) {
        console.error('[v0] Error importing TLE:', error);
        errors.push(`Error processing NORAD ${tle.norad_id}: ${error}`);
      }
    }

    await sql`
      INSERT INTO data_imports (
        import_type, source, status, 
        records_imported, error_message,
        import_started_at, import_completed_at,
        metadata
      )
      VALUES (
        'TLE', 'Space-Track', ${errors.length > 0 ? 'PARTIAL' : 'SUCCESS'},
        ${recordsImported}, ${errors.length > 0 ? errors.join('; ') : null},
        ${importStarted.toISOString()}, ${new Date().toISOString()},
        ${JSON.stringify({ total: tleData.length, errors: errors.length })}
      )
    `;

    return NextResponse.json({
      success: true,
      recordsImported,
      totalRecords: tleData.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${recordsImported} TLE records from Space-Track.org`,
    });
  } catch (error) {
    console.error('[v0] Import error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to import data',
        message: 'Please ensure you have valid Space-Track.org TLE data'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/import/space-track - Get import instructions
 */
export async function GET() {
  return NextResponse.json({
    message: 'Space-Track.org Data Import API',
    instructions: [
      '1. Register at https://www.space-track.org',
      '2. Download TLE data in CSV or 3LE format',
      '3. POST the data to this endpoint in the specified format',
      '4. Alternatively, provide your Space-Track API credentials to automate imports',
    ],
    dataSource: 'Space-Track.org',
    requiredFields: {
      norad_id: 'NORAD catalog number (required)',
      name: 'Satellite name (optional)',
      line1: 'TLE Line 1 (required)',
      line2: 'TLE Line 2 (required)',
      international_designator: 'International designator (optional)',
      object_type: 'Object type (optional)',
      country: 'Country of origin (optional)',
      launch_date: 'Launch date (optional)',
    },
  });
}
