import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { TLEData } from '@/lib/db';

/**
 * POST /api/predictions - Generate trajectory prediction using LSTM ML model
 * Requires Python ML service to be running
 * Data source: Space-Track.org TLE
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { satelliteId, predictionHorizonHours = 24 } = body;

    if (!satelliteId) {
      return NextResponse.json(
        { error: 'satelliteId is required' },
        { status: 400 }
      );
    }

    const mlServiceUrl = process.env.PYTHON_ML_SERVICE_URL;
    if (!mlServiceUrl) {
      return NextResponse.json(
        {
          error: 'Python ML service not configured',
          message: 'LSTM trajectory predictions require the Python ML service to be set up',
          instructions: 'Contact your administrator to configure PYTHON_ML_SERVICE_URL',
        },
        { status: 503 }
      );
    }

    const tleData = await sql<TLEData[]>`
      SELECT * FROM tle_data 
      WHERE satellite_id = ${satelliteId}
      ORDER BY epoch DESC
      LIMIT 1
    `;

    if (tleData.length === 0) {
      return NextResponse.json(
        { error: 'No TLE data found. Please import Space-Track TLE data for this satellite.' },
        { status: 404 }
      );
    }

    const tle = tleData[0];

    const mlResponse = await fetch(`${mlServiceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        satellite_id: satelliteId,
        norad_id: tle.norad_id,
        tle_line1: tle.tle_line1,
        tle_line2: tle.tle_line2,
        prediction_horizon_hours: predictionHorizonHours,
      }),
    });

    if (!mlResponse.ok) {
      const errorText = await mlResponse.text();
      console.error('[v0] ML service error:', errorText);
      return NextResponse.json(
        {
          error: 'ML prediction failed',
          details: errorText,
          message: 'Python LSTM service returned an error',
        },
        { status: mlResponse.status }
      );
    }

    const prediction = await mlResponse.json();

    await sql`
      INSERT INTO trajectory_predictions (
        satellite_id, prediction_time, prediction_horizon,
        predicted_positions, confidence_score, model_version
      )
      VALUES (
        ${satelliteId},
        ${new Date().toISOString()},
        ${predictionHorizonHours},
        ${JSON.stringify(prediction.predicted_positions)},
        ${prediction.confidence_score || null},
        ${prediction.model_version || 'lstm-v1.0'}
      )
    `;

    return NextResponse.json({
      satelliteId,
      noradId: tle.norad_id,
      predictionHorizonHours,
      predictedPositions: prediction.predicted_positions,
      confidenceScore: prediction.confidence_score,
      modelVersion: prediction.model_version,
      dataSource: 'Space-Track.org TLE with LSTM enhancement',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[v0] Prediction error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate prediction',
        message: 'Ensure Python ML service is running and accessible',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/predictions - Get prediction history for a satellite
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const satelliteId = searchParams.get('satelliteId');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!satelliteId) {
      return NextResponse.json(
        {
          message: 'LSTM Trajectory Prediction API',
          description: 'Generate enhanced trajectory predictions using Python ML service',
          dataSource: 'Space-Track.org TLE',
          usage: {
            method: 'POST',
            body: {
              satelliteId: 'number (required)',
              predictionHorizonHours: 'number (default: 24)',
            },
          },
          requirements: [
            'PYTHON_ML_SERVICE_URL environment variable must be set',
            'Python ML service must be running',
            'TLE data from Space-Track must be available',
          ],
        }
      );
    }

    const predictions = await sql`
      SELECT * FROM trajectory_predictions
      WHERE satellite_id = ${parseInt(satelliteId)}
      ORDER BY prediction_time DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      satelliteId: parseInt(satelliteId),
      predictions,
      dataSource: 'Space-Track.org TLE',
    });
  } catch (error) {
    console.error('[v0] Error fetching predictions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch predictions' },
      { status: 500 }
    );
  }
}
