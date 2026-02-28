'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Send, Loader2, Sparkles, CheckCircle, X,
  ChevronUp, ChevronDown, Satellite, BarChart3, AlertTriangle, Search,
} from 'lucide-react';

interface Message { id: string; role: 'user' | 'assistant'; content: string; }

interface RiskItem {
  id: number; primaryName: string; secondaryName: string;
  missDistanceKm: number; riskLevel: string; recommendation: string;
  urgency: 'IMMEDIATE' | 'SOON' | 'MONITOR' | 'LOW';
}

interface AnalysisResult {
  summary?: string; overallRisk?: string; risks?: RiskItem[];
  recommendations?: string[]; tleDataQuality?: string; error?: string;
}

interface SatAnalysis {
  orbitType?: string; altitudeKm?: number; periodMinutes?: number;
  orbitDescription?: string; stabilityRating?: string; stabilityNotes?: string;
  reentryRisk?: string; reentryEstimate?: string; tleQuality?: string;
  tleAgeDays?: number; tleNotes?: string; bstarAnalysis?: string;
  recommendations?: string[]; interestingFacts?: string[];
}

interface TrafficStats {
  congestionLevel?: string; summary?: string; keyFindings?: string[];
  debrisRatio?: string; mostCongested?: string; dataQualityScore?: string | number;
  trendAnalysis?: string; recommendations?: string[];
  stats?: { total: number; active: number; payloads: number; rocketBodies: number; debris: number; activeRisks: number };
  error?: string;
}

const SUGGESTIONS = [
  'Какие спутники наиболее опасны?',
  'Как работает SGP4 пропагация?',
  'Что такое BSTAR коэффициент?',
  'Объясни риски на LEO орбите',
  'Что такое TLE данные?',
];

const URGENCY_CLS: Record<string, string> = {
  IMMEDIATE: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  SOON: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  MONITOR: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  LOW: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

const RISK_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-500', HIGH: 'text-orange-500',
  MEDIUM: 'text-yellow-500', LOW: 'text-green-500', UNKNOWN: 'text-muted-foreground',
};

const STABILITY_COLOR: Record<string, string> = {
  STABLE: 'text-green-500', MODERATE: 'text-yellow-500',
  UNSTABLE: 'text-orange-500', DECAYING: 'text-red-500',
};

const CONGESTION_COLOR: Record<string, string> = {
  LOW: 'text-green-500', MODERATE: 'text-yellow-500',
  HIGH: 'text-orange-500', CRITICAL: 'text-red-500',
};

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'risks' | 'satellite' | 'traffic'>('chat');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [satInput, setSatInput] = useState('');
  const [satLoading, setSatLoading] = useState(false);
  const [satResult, setSatResult] = useState<{ satellite: Record<string, unknown>; analysis: SatAnalysis } | null>(null);
  const [satError, setSatError] = useState('');

  const [traffic, setTraffic] = useState<TrafficStats | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: trimmed };
    const asstId = `a${Date.now() + 1}`;
    setMessages(prev => [...prev, userMsg, { id: asstId, role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, content: 'Ошибка API. Проверьте GEMINI_API_KEY.' } : m
        ));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('0:')) continue;
          try {
            full += JSON.parse(line.slice(2));
            setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: full } : m));
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, content: 'Ошибка соединения.' } : m
        ));
      }
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

  const runAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch('/api/ai/analyze-risks', { method: 'POST' });
      setAnalysis(await res.json());
    } catch {
      setAnalysis({ error: 'Ошибка подключения к AI.' });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const analyzeSatellite = async () => {
    if (!satInput.trim()) return;
    setSatLoading(true);
    setSatResult(null);
    setSatError('');
    try {
      const isNumeric = /^\d+$/.test(satInput.trim());
      const body = isNumeric
        ? { noradId: satInput.trim() }
        : { noradId: satInput.trim() }; // backend handles name search too
      const res = await fetch('/api/ai/satellite-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) setSatError(data.error);
      else setSatResult(data);
    } catch {
      setSatError('Ошибка подключения.');
    } finally {
      setSatLoading(false);
    }
  };

  const loadTraffic = async () => {
    setTrafficLoading(true);
    setTraffic(null);
    try {
      const res = await fetch('/api/ai/traffic-stats', { method: 'POST' });
      setTraffic(await res.json());
    } catch {
      setTraffic({ error: 'Ошибка подключения.' });
    } finally {
      setTrafficLoading(false);
    }
  };

  const tabs = [
    { key: 'chat' as const,      label: 'Чат',     icon: Brain },
    { key: 'risks' as const,     label: 'Риски',   icon: AlertTriangle },
    { key: 'satellite' as const, label: 'Спутник', icon: Satellite },
    { key: 'traffic' as const,   label: 'Трафик',  icon: BarChart3 },
  ];

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[400px] flex flex-col bg-background border rounded-xl shadow-2xl overflow-hidden" style={{ height: 560 }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">AI Ассистент</span>
              <Badge variant="secondary" className="text-xs font-normal">Gemini 2.0</Badge>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-muted rounded text-muted-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b shrink-0">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors border-b-2 ${
                  tab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* ── CHAT ── */}
          {tab === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {messages.length === 0 ? (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs text-muted-foreground text-center">Задайте вопрос о спутниках и орбитах</p>
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted transition-colors leading-snug"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      {m.content || (m.role === 'assistant' && streaming
                        ? <span className="inline-flex gap-1">{[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
                        : null)}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="px-3 pb-3 pt-2 border-t shrink-0 flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="Введите вопрос..."
                  disabled={streaming}
                  className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                />
                <Button size="sm" onClick={() => sendMessage(input)} disabled={streaming || !input.trim()} className="shrink-0">
                  {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}

          {/* ── RISKS ── */}
          {tab === 'risks' && (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              <Button size="sm" className="w-full gap-2" onClick={runAnalysis} disabled={analysisLoading}>
                {analysisLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Анализирую риски...</>
                  : <><Sparkles className="w-3.5 h-3.5" />{analysis ? 'Обновить анализ' : 'Запустить AI анализ'}</>}
              </Button>

              {analysis?.error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">{analysis.error}</p>
              )}

              {analysis && !analysis.error && (
                <div className="space-y-3 text-sm">
                  <div className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Общий риск</span>
                      <span className={`text-sm font-bold ${RISK_COLOR[analysis.overallRisk ?? 'UNKNOWN']}`}>{analysis.overallRisk}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{analysis.summary}</p>
                    {analysis.tleDataQuality && (
                      <p className="text-xs text-muted-foreground border-t pt-1 italic">{analysis.tleDataQuality}</p>
                    )}
                  </div>

                  {(analysis.risks?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Риски ({analysis.risks!.length})</p>
                      {analysis.risks!.map((r, i) => (
                        <div key={i} className="rounded-lg border p-2.5 space-y-1">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-medium leading-snug">{r.primaryName} ↔ {r.secondaryName}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${URGENCY_CLS[r.urgency] ?? ''}`}>{r.urgency}</span>
                          </div>
                          {r.missDistanceKm != null && <p className="text-xs text-muted-foreground">{r.missDistanceKm.toFixed(1)} км · {r.riskLevel}</p>}
                          <p className="text-xs">{r.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {(analysis.recommendations?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Рекомендации</p>
                      {analysis.recommendations!.map((r, i) => (
                        <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── SATELLITE ── */}
          {tab === 'satellite' && (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              <div className="flex gap-2">
                <input
                  value={satInput}
                  onChange={e => setSatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') analyzeSatellite(); }}
                  placeholder="NORAD ID (напр. 25544)"
                  className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background outline-none focus:ring-1 focus:ring-ring"
                />
                <Button size="sm" onClick={analyzeSatellite} disabled={satLoading || !satInput.trim()}>
                  {satLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>

              {satError && <p className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">{satError}</p>}

              {satResult && (
                <div className="space-y-3 text-sm">
                  {/* Satellite info */}
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="font-semibold">{String(satResult.satellite.name ?? '')}</p>
                    <p className="text-xs text-muted-foreground">NORAD: {String(satResult.satellite.norad_id ?? '')} · {String(satResult.satellite.object_type ?? 'UNKNOWN')} · {String(satResult.satellite.country ?? '?')}</p>
                  </div>

                  {/* Orbit summary */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Тип орбиты', value: satResult.analysis.orbitType },
                      { label: 'Высота', value: satResult.analysis.altitudeKm ? `~${satResult.analysis.altitudeKm} км` : undefined },
                      { label: 'Период', value: satResult.analysis.periodMinutes ? `${satResult.analysis.periodMinutes} мин` : undefined },
                      { label: 'Возраст TLE', value: satResult.analysis.tleAgeDays != null ? `${satResult.analysis.tleAgeDays} дней` : undefined },
                    ].map(({ label, value }) => value ? (
                      <div key={label} className="rounded-lg border p-2">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-xs font-medium">{value}</p>
                      </div>
                    ) : null)}
                  </div>

                  {/* Stability & reentry */}
                  <div className="rounded-lg border p-2.5 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Стабильность</span>
                      <span className={`font-medium ${STABILITY_COLOR[satResult.analysis.stabilityRating ?? ''] ?? ''}`}>{satResult.analysis.stabilityRating}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Риск схода</span>
                      <span className={`font-medium ${RISK_COLOR[satResult.analysis.reentryRisk ?? ''] ?? ''}`}>{satResult.analysis.reentryRisk}</span>
                    </div>
                    {satResult.analysis.reentryEstimate && satResult.analysis.reentryEstimate !== 'N/A' && (
                      <p className="text-xs text-muted-foreground">Прогноз: {satResult.analysis.reentryEstimate}</p>
                    )}
                  </div>

                  {satResult.analysis.orbitDescription && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{satResult.analysis.orbitDescription}</p>
                  )}

                  {(satResult.analysis.interestingFacts?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Интересные факты</p>
                      {satResult.analysis.interestingFacts!.map((f, i) => (
                        <p key={i} className="text-xs text-muted-foreground">• {f}</p>
                      ))}
                    </div>
                  )}

                  {(satResult.analysis.recommendations?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Рекомендации</p>
                      {satResult.analysis.recommendations!.map((r, i) => (
                        <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TRAFFIC ── */}
          {tab === 'traffic' && (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              <Button size="sm" className="w-full gap-2" onClick={loadTraffic} disabled={trafficLoading}>
                {trafficLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Анализирую трафик...</>
                  : <><BarChart3 className="w-3.5 h-3.5" />{traffic ? 'Обновить статистику' : 'Загрузить статистику трафика'}</>}
              </Button>

              {traffic?.error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">{traffic.error}</p>
              )}

              {traffic && !traffic.error && (
                <div className="space-y-3 text-sm">
                  {/* Congestion level */}
                  <div className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Загруженность орбиты</span>
                      <span className={`text-sm font-bold ${CONGESTION_COLOR[traffic.congestionLevel ?? ''] ?? ''}`}>{traffic.congestionLevel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{traffic.summary}</p>
                  </div>

                  {/* Stats grid */}
                  {traffic.stats && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Всего', value: traffic.stats.total, color: 'text-foreground' },
                        { label: 'Активных', value: traffic.stats.active, color: 'text-green-500' },
                        { label: 'Нагрузки', value: traffic.stats.payloads, color: 'text-blue-500' },
                        { label: 'Ступени', value: traffic.stats.rocketBodies, color: 'text-orange-500' },
                        { label: 'Мусор', value: traffic.stats.debris, color: 'text-red-500' },
                        { label: 'Риски', value: traffic.stats.activeRisks, color: 'text-red-500' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-lg border p-2 text-center">
                          <p className={`text-lg font-bold ${color}`}>{value}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {traffic.mostCongested && (
                    <div className="rounded-lg border p-2.5 space-y-1">
                      <p className="text-xs text-muted-foreground">Наиболее загруженный режим</p>
                      <p className="text-xs font-medium">{traffic.mostCongested}</p>
                      {traffic.dataQualityScore && (
                        <p className="text-xs text-muted-foreground">Качество данных: {traffic.dataQualityScore}/100</p>
                      )}
                    </div>
                  )}

                  {(traffic.keyFindings?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ключевые находки</p>
                      {traffic.keyFindings!.map((f, i) => (
                        <p key={i} className="text-xs text-muted-foreground">• {f}</p>
                      ))}
                    </div>
                  )}

                  {traffic.trendAnalysis && (
                    <div className="rounded-lg bg-muted/50 p-2.5">
                      <p className="text-xs font-semibold mb-1">Тренды</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{traffic.trendAnalysis}</p>
                    </div>
                  )}

                  {(traffic.recommendations?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Рекомендации</p>
                      {traffic.recommendations!.map((r, i) => (
                        <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toggle button */}
      <Button onClick={() => setOpen(o => !o)} className="rounded-full h-11 px-5 shadow-lg gap-2">
        <Brain className="w-4 h-4" />
        AI Ассистент
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}
