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
      temperature: 0.4,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function POST(req: Request) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return Response.json({ error: 'MISTRAL_API_KEY not set' }, { status: 500 });

  const { noradId, satelliteId } = await req.json();
  const sql = getDb();

  const [sat] = await sql`
    SELECT s.*, t.tle_line1, t.tle_line2, t.epoch, t.inclination, t.eccentricity,
           t.mean_motion, t.right_ascension, t.argument_of_perigee,
           t.bstar, t.mean_anomaly, t.revolution_number
    FROM satellites s
    LEFT JOIN tle_data t ON t.satellite_id = s.id
    WHERE ${satelliteId ? sql`s.id = ${satelliteId}` : sql`s.norad_id = ${noradId}`}
    ORDER BY t.epoch DESC NULLS LAST
    LIMIT 1
  `;

  if (!sat) return Response.json({ error: 'Satellite not found' }, { status: 404 });

  const tleAgeDays = sat.epoch
    ? Math.floor((Date.now() - new Date(sat.epoch).getTime()) / 86400000)
    : null;
  const periodMin = sat.mean_motion ? (1440 / sat.mean_motion).toFixed(1) : 'N/A';

  const prompt = `Спутник: ${sat.name} (NORAD: ${sat.norad_id})
Тип: ${sat.object_type || 'UNKNOWN'}, Страна: ${sat.country || 'N/A'}
Запуск: ${sat.launch_date || 'N/A'}
Орбитальные параметры (TLE возраст: ${tleAgeDays ?? '?'} дней):
- Наклонение: ${sat.inclination ?? 'N/A'}°
- Эксцентриситет: ${sat.eccentricity ?? 'N/A'}
- Среднее движение: ${sat.mean_motion ?? 'N/A'} об/день (период: ~${periodMin} мин)
- BSTAR: ${sat.bstar ?? 'N/A'}
- Обороты: ${sat.revolution_number ?? 'N/A'}

Верни JSON:
{
  "orbitType": "LEO|MEO|GEO|HEO|SSO|UNKNOWN",
  "altitudeKm": 0,
  "periodMinutes": 0,
  "orbitDescription": "описание на русском",
  "stabilityRating": "STABLE|MODERATE|UNSTABLE|DECAYING",
  "stabilityNotes": "пояснение",
  "reentryRisk": "NONE|LOW|MEDIUM|HIGH|IMMINENT",
  "reentryEstimate": "оценка или N/A",
  "tleQuality": "FRESH|ACCEPTABLE|STALE|VERY_STALE",
  "tleAgeDays": ${tleAgeDays ?? 0},
  "tleNotes": "заметки",
  "bstarAnalysis": "анализ торможения",
  "recommendations": ["рекомендация 1"],
  "interestingFacts": ["факт 1"]
}`;

  try {
    const analysis = await callMistral(apiKey, prompt);
    return Response.json({ satellite: sat, analysis });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
