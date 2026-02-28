import { generateText, Output } from 'ai';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { collisionRiskId } = await req.json();

  if (!collisionRiskId) {
    return NextResponse.json({ error: 'collisionRiskId is required' }, { status: 400 });
  }

  const sql = getDb();

  const rows = await sql`
    SELECT cr.*, 
           s1.name as primary_name, s1.object_type as primary_type, s1.country as primary_country,
           s2.name as secondary_name, s2.object_type as secondary_type, s2.country as secondary_country,
           t1.tle_line1 as primary_tle1, t1.tle_line2 as primary_tle2, t1.epoch as primary_epoch,
           t1.inclination as primary_incl, t1.mean_motion as primary_mm, t1.eccentricity as primary_ecc
    FROM collision_risks cr
    LEFT JOIN satellites s1 ON s1.norad_id = cr.primary_norad_id
    LEFT JOIN satellites s2 ON s2.norad_id = cr.secondary_norad_id
    LEFT JOIN tle_data t1 ON t1.satellite_id = s1.id
    WHERE cr.id = ${collisionRiskId}
    ORDER BY t1.epoch DESC NULLS LAST
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Collision risk not found' }, { status: 404 });
  }

  const c = rows[0];

  const result = await generateText({
    model: 'openai/gpt-4o-mini',
    output: Output.object({
      schema: z.object({
        maneuverType: z.enum(['RADIAL', 'TANGENTIAL', 'NORMAL', 'COMBINED']),
        deltaVMs: z.number(),
        executionLeadTimeHours: z.number(),
        durationSeconds: z.number(),
        fuelCostKg: z.number().nullable(),
        expectedNewMissDistanceKm: z.number(),
        successProbability: z.number(),
        rationale: z.string(),
        risks: z.string(),
        alternativeOptions: z.array(z.object({
          type: z.string(),
          deltaVMs: z.number(),
          description: z.string(),
        })),
        warningFlags: z.array(z.string()),
      }),
    }),
    prompt: `Ты эксперт по орбитальной механике и манёврам уклонения от столкновений.

Данные сближения (Space-Track.org):
- Первичный спутник: ${c.primary_name || 'Unknown'} (NORAD: ${c.primary_norad_id}, тип: ${c.primary_type}, страна: ${c.primary_country})
- Вторичный объект: ${c.secondary_name || 'Unknown'} (NORAD: ${c.secondary_norad_id}, тип: ${c.secondary_type})
- Время наибольшего сближения (TCA): ${c.tca}
- Расстояние пролёта: ${c.miss_distance} км
- Относительная скорость: ${c.relative_velocity} м/с
- Уровень риска: ${c.risk_level}
- Вероятность столкновения: ${c.collision_probability || 'не рассчитано'}

Орбитальные параметры первичного спутника:
- Наклонение: ${c.primary_incl}°
- Среднее движение: ${c.primary_mm} об/день
- Эксцентриситет: ${c.primary_ecc}
- Эпоха TLE: ${c.primary_epoch ? new Date(c.primary_epoch).toLocaleDateString() : 'неизвестно'}

Рассчитай оптимальный манёвр уклонения:
- Тип манёвра (RADIAL/TANGENTIAL/NORMAL/COMBINED)
- ΔV в м/с
- Время выполнения (за сколько часов до TCA)
- Длительность включения двигателя
- Расход топлива
- Ожидаемое новое расстояние пролёта
- Вероятность успеха
- Риски и предупреждения
- 2-3 альтернативных варианта

Если TLE устаревшие или данных недостаточно — укажи это в warningFlags.`,
  });

  const plan = result.output;
  await sql`
    UPDATE collision_risks
    SET 
      maneuver_plan = ${JSON.stringify(plan)},
      maneuver_delta_v = ${plan.deltaVMs},
      maneuver_planned = true,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${collisionRiskId}
  `;

  return NextResponse.json({
    collisionRiskId,
    plan,
    aiModel: 'openai/gpt-4o-mini via Vercel AI Gateway',
    generatedAt: new Date().toISOString(),
    dataSource: 'Space-Track.org',
  });
}
