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
        { role: 'system', content: 'You are an orbital safety expert. Always respond with valid JSON only, no markdown, no code blocks.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}

export async function POST(_req: Request) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return Response.json({ error: 'MISTRAL_API_KEY not set' }, { status: 500 });

  const sql = getDb();

  const collisions = await sql`
    SELECT cr.id, cr.primary_norad_id, cr.secondary_norad_id,
      cr.miss_distance, cr.risk_level, cr.tca, cr.relative_velocity, cr.probability,
      s1.name as primary_name, s1.object_type as primary_type,
      s2.name as secondary_name, s2.object_type as secondary_type
    FROM collision_risks cr
    LEFT JOIN satellites s1 ON s1.norad_id = cr.primary_norad_id
    LEFT JOIN satellites s2 ON s2.norad_id = cr.secondary_norad_id
    WHERE cr.status = 'ACTIVE'
    ORDER BY cr.miss_distance ASC LIMIT 20
  `;

  const satellites = await sql`
    SELECT s.name, s.norad_id, s.object_type, s.country, t.epoch
    FROM satellites s
    LEFT JOIN tle_data t ON t.satellite_id = s.id
    ORDER BY t.epoch DESC NULLS LAST LIMIT 20
  `;

  if (collisions.length === 0 && satellites.length === 0) {
    return Response.json({
      summary: 'В базе данных нет данных для анализа. Импортируйте TLE данные с Space-Track.org.',
      risks: [], recommendations: ['Импортируйте данные через вкладку Import Data'], overallRisk: 'UNKNOWN',
    });
  }

  const prompt = `Спутники (${satellites.length} шт):
${satellites.map((s: { name: string; norad_id: string; object_type: string; country: string; epoch: string }) =>
    `- ${s.name} (NORAD: ${s.norad_id}, тип: ${s.object_type}, страна: ${s.country})`).join('\n')}

Активные риски (${collisions.length} шт):
${collisions.length > 0
    ? collisions.map((c: { id: number; primary_name: string; primary_norad_id: string; secondary_name: string; secondary_norad_id: string; miss_distance: number; risk_level: string; relative_velocity: number }) =>
      `- ID:${c.id} | ${c.primary_name || c.primary_norad_id} <-> ${c.secondary_name || c.secondary_norad_id} | ${Number(c.miss_distance).toFixed(2)} км | ${c.risk_level} | ${c.relative_velocity} м/с`).join('\n')
    : 'Нет активных рисков'}

Верни JSON:
{
  "summary": "краткий анализ на русском",
  "overallRisk": "LOW|MEDIUM|HIGH|CRITICAL|UNKNOWN",
  "risks": [{"id": 1, "primaryName": "...", "secondaryName": "...", "missDistanceKm": 0.0, "riskLevel": "...", "priority": 1, "recommendation": "...", "urgency": "IMMEDIATE|SOON|MONITOR|LOW"}],
  "recommendations": ["рекомендация 1"],
  "tleDataQuality": "оценка качества"
}`;

  try {
    const result = await callMistral(apiKey, prompt);
    return Response.json(result);
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
