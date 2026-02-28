import { getDb } from '@/lib/db';

export const maxDuration = 30;

async function callMistral(apiKey: string, prompt: string): Promise<unknown> {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      messages: [
        { role: 'system', content: 'You are an orbital mechanics expert. Always respond with valid JSON only, no markdown, no code blocks.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}

export async function POST(req: Request) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return Response.json({ error: 'MISTRAL_API_KEY not set' }, { status: 500 });

  const { collisionRiskId } = await req.json();
  if (!collisionRiskId) return Response.json({ error: 'collisionRiskId is required' }, { status: 400 });

  const sql = getDb();

  const rows = await sql`
    SELECT cr.*,
      s1.name as primary_name, s1.object_type as primary_type, s1.country as primary_country,
      s2.name as secondary_name, s2.object_type as secondary_type,
      t1.epoch as primary_epoch, t1.inclination as primary_incl,
      t1.mean_motion as primary_mm, t1.eccentricity as primary_ecc
    FROM collision_risks cr
    LEFT JOIN satellites s1 ON s1.norad_id = cr.primary_norad_id
    LEFT JOIN satellites s2 ON s2.norad_id = cr.secondary_norad_id
    LEFT JOIN tle_data t1 ON t1.satellite_id = s1.id
    WHERE cr.id = ${collisionRiskId}
    ORDER BY t1.epoch DESC NULLS LAST LIMIT 1
  `;

  if (rows.length === 0) return Response.json({ error: 'Collision risk not found' }, { status: 404 });

  const c = rows[0];

  const prompt = `Сближение:
- Первичный: ${c.primary_name || 'Unknown'} (NORAD: ${c.primary_norad_id}, тип: ${c.primary_type}, страна: ${c.primary_country})
- Вторичный: ${c.secondary_name || 'Unknown'} (NORAD: ${c.secondary_norad_id})
- TCA: ${c.tca}, расстояние: ${c.miss_distance} км, скорость: ${c.relative_velocity} м/с
- Риск: ${c.risk_level}, вероятность: ${c.probability || 'н/д'}
- Наклонение: ${c.primary_incl}°, ср. движение: ${c.primary_mm} об/день, эксцентриситет: ${c.primary_ecc}

Верни JSON:
{
  "maneuverType": "RADIAL|TANGENTIAL|NORMAL|COMBINED",
  "deltaVMs": 0.0,
  "executionLeadTimeHours": 0,
  "durationSeconds": 0,
  "fuelCostKg": 0.0,
  "expectedNewMissDistanceKm": 0.0,
  "successProbability": 0.0,
  "rationale": "обоснование на русском",
  "risks": "риски на русском",
  "alternativeOptions": [{"type": "...", "deltaVMs": 0.0, "description": "..."}],
  "warningFlags": ["предупреждение"]
}`;

  try {
    const plan = await callMistral(apiKey, prompt);

    await sql`
      UPDATE collision_risks
      SET maneuver_plan = ${JSON.stringify(plan)},
          maneuver_planned = true,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${collisionRiskId}
    `.catch(() => {});

    return Response.json({
      collisionRiskId,
      plan,
      aiModel: 'mistral-large-latest',
      generatedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
