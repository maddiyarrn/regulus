import { getDb } from '@/lib/db';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 });
  }

  const sql = getDb();
  let ctx = '';
  try {
    const [{ count: satCount }] = await sql`SELECT COUNT(*)::int as count FROM satellites`;
    const [{ count: tleCount }] = await sql`SELECT COUNT(*)::int as count FROM tle_data`;
    const [{ count: riskCount }] = await sql`SELECT COUNT(*)::int as count FROM collision_risks WHERE status = 'ACTIVE'`;
    const types = await sql`SELECT object_type, COUNT(*)::int as cnt FROM satellites GROUP BY object_type ORDER BY cnt DESC LIMIT 6`;
    ctx = `\nДанные системы: ${satCount} спутников, ${tleCount} TLE записей, ${riskCount} активных рисков. Типы: ${types.map((t: { object_type: string; cnt: number }) => `${t.object_type || 'UNKNOWN'}: ${t.cnt}`).join(', ')}.`;
  } catch { /* ignore */ }

  const systemPrompt = `Ты — AI-ассистент системы мониторинга орбитальных столкновений. Специализируешься на TLE данных, SGP4 пропагации, орбитальной механике, рисках столкновений, Space-Track.org API, манёврах уклонения.${ctx} Отвечай на языке пользователя (русский/английский). Давай точные конкретные ответы.`;

  const mistralMessages = [
    { role: 'system', content: systemPrompt },
    ...(messages as { role: string; content: string }[])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content ?? '' })),
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'mistral-large-latest',
            messages: mistralMessages,
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
          }),
        });

        if (!mistralRes.ok || !mistralRes.body) {
          const err = await mistralRes.text();
          controller.enqueue(encoder.encode(`0:${JSON.stringify('Ошибка Mistral: ' + err.slice(0, 200))}\n`));
          controller.close();
          return;
        }

        const reader = mistralRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const parsed = JSON.parse(raw);
              const text = parsed?.choices?.[0]?.delta?.content;
              if (text) {
                controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
              }
            } catch { /* skip */ }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encoder.encode(`0:${JSON.stringify('Ошибка: ' + msg)}\n`));
      } finally {
        controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Vercel-AI-Data-Stream': 'v1',
    },
  });
}
