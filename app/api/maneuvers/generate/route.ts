import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { CollisionRisk } from '@/lib/db';

/**
 * POST /api/maneuvers/generate - Generate collision avoidance maneuver using Mistral AI
 * 
 * Uses your Mistral API key to generate maneuver recommendations
 * based on collision data from Space-Track.org
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { collisionRiskId } = body;

    if (!collisionRiskId) {
      return NextResponse.json(
        { error: 'collisionRiskId is required' },
        { status: 400 }
      );
    }

    const collisionRisks = await sql<CollisionRisk[]>`
      SELECT * FROM collision_risks WHERE id = ${collisionRiskId}
    `;

    if (collisionRisks.length === 0) {
      return NextResponse.json(
        { error: 'Collision risk not found' },
        { status: 404 }
      );
    }

    const collision = collisionRisks[0];

    const mistralApiKey = process.env.MISTRAL_API_KEY;
    if (!mistralApiKey) {
      return NextResponse.json(
        { 
          error: 'Mistral API key not configured',
          message: 'Please provide your MISTRAL_API_KEY environment variable',
          instructions: 'Set MISTRAL_API_KEY in your environment variables to enable AI-powered maneuver planning'
        },
        { status: 503 }
      );
    }

    const prompt = `You are a spacecraft collision avoidance expert. Analyze the following collision scenario and generate a detailed maneuver plan.

Collision Data (from Space-Track.org):
- Primary Satellite NORAD ID: ${collision.primary_norad_id}
- Secondary Satellite NORAD ID: ${collision.secondary_norad_id}
- Time of Closest Approach (TCA): ${collision.tca}
- Miss Distance: ${collision.miss_distance} km
- Relative Velocity: ${collision.relative_velocity} m/s
- Risk Level: ${collision.risk_level}

Primary Position (ECI): [${collision.primary_position_x}, ${collision.primary_position_y}, ${collision.primary_position_z}]
Secondary Position (ECI): [${collision.secondary_position_x}, ${collision.secondary_position_y}, ${collision.secondary_position_z}]

Generate a comprehensive collision avoidance maneuver plan including:
1. Recommended maneuver type (radial, along-track, cross-track, or combined)
2. Delta-V magnitude and direction
3. Optimal execution time relative to TCA
4. Expected new miss distance after maneuver
5. Fuel consumption estimate
6. Risk assessment after maneuver
7. Alternative maneuver options if applicable

Format the response as a structured JSON with clear recommendations.`;

    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in orbital mechanics and spacecraft collision avoidance. Provide precise, actionable maneuver recommendations based on TLE data from Space-Track.org.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!mistralResponse.ok) {
      const error = await mistralResponse.text();
      console.error('[v0] Mistral API error:', error);
      return NextResponse.json(
        { 
          error: 'Mistral API request failed',
          details: error,
        },
        { status: mistralResponse.status }
      );
    }

    const mistralData = await mistralResponse.json();
    const maneuverPlan = mistralData.choices[0]?.message?.content;

    if (!maneuverPlan) {
      return NextResponse.json(
        { error: 'No maneuver plan generated' },
        { status: 500 }
      );
    }

    let deltaV: number | null = null;
    const deltaVMatch = maneuverPlan.match(/delta[-\s]?v[:\s]+([0-9.]+)/i);
    if (deltaVMatch) {
      deltaV = parseFloat(deltaVMatch[1]);
    }

    await sql`
      UPDATE collision_risks
      SET 
        maneuver_plan = ${maneuverPlan},
        maneuver_delta_v = ${deltaV},
        maneuver_planned = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${collisionRiskId}
    `;

    return NextResponse.json({
      collisionRiskId,
      maneuverPlan,
      deltaV,
      aiModel: 'Mistral Large',
      dataSource: 'Space-Track.org',
      generatedAt: new Date().toISOString(),
      message: 'Maneuver plan generated successfully using Mistral AI',
    });
  } catch (error) {
    console.error('[v0] Maneuver generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate maneuver plan',
        message: 'Please ensure your Mistral API key is valid',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/maneuvers/generate - Get maneuver generation info
 */
export async function GET() {
  return NextResponse.json({
    message: 'AI-Powered Maneuver Generation API',
    description: 'Generates collision avoidance maneuvers using Mistral AI based on Space-Track.org data',
    dataSource: 'Space-Track.org',
    aiProvider: 'Mistral AI',
    requirements: [
      'MISTRAL_API_KEY environment variable must be set',
      'Valid collision risk ID from Space-Track analysis',
    ],
    usage: {
      method: 'POST',
      body: {
        collisionRiskId: 'number (required) - ID of collision risk to generate maneuver for',
      },
    },
  });
}
