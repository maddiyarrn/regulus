'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { X } from 'lucide-react';

export interface SatelliteData {
  id: number;
  name: string;
  norad_id: string;
  orbitPath?: [number, number, number][];
  color?: string;
  object_type?: string;
  country?: string;
  tle_line1?: string;
  tle_line2?: string;
}

interface Props {
  satellites: SatelliteData[];
  onSelectSatellite?: (sat: SatelliteData | null) => void;
}

const PALETTE = [
  '#60a5fa','#34d399','#f59e0b','#f87171','#a78bfa',
  '#38bdf8','#fb923c','#4ade80','#e879f9','#fbbf24','#2dd4bf','#f472b6',
];

const TYPE_COLORS: Record<string, string> = {
  PAYLOAD:       '#60a5fa',
  'ROCKET BODY': '#f59e0b',
  DEBRIS:        '#f87171',
  UNKNOWN:       '#94a3b8',
};

const OBJECT_TYPES = ['ALL','PAYLOAD','ROCKET BODY','DEBRIS','UNKNOWN'];
const GROUP_OPTIONS = ['NONE','TYPE','COUNTRY'] as const;
type GroupOption = (typeof GROUP_OPTIONS)[number];

const R = 6371;

function safeHex(c: string | undefined, idx: number) {
  return c?.startsWith('#') && c.length >= 7 ? c : PALETTE[idx % PALETTE.length];
}

function toRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function OrbitVisualizerV2({ satellites, onSelectSatellite }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef    = useRef({ x: 0.35, y: 0 });
  const zoomRef   = useRef(1);
  const dragRef   = useRef({ active: false, lx: 0, ly: 0 });

  const [, forceRender] = useState(0);
  const [selected, setSelected] = useState<SatelliteData | null>(null);
  const [showFilters,   setShowFilters]   = useState(false);
  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState('ALL');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [groupBy,       setGroupBy]       = useState<GroupOption>('NONE');

  const countries = useMemo(() => {
    const s = new Set(satellites.map(sat => sat.country || 'UNKNOWN'));
    return ['ALL', ...Array.from(s).sort()];
  }, [satellites]);

  const visible = useMemo(() => satellites.filter(sat => {
    if (typeFilter    !== 'ALL' && sat.object_type                !== typeFilter)    return false;
    if (countryFilter !== 'ALL' && (sat.country || 'UNKNOWN')    !== countryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!sat.name?.toLowerCase().includes(q) && !sat.norad_id?.includes(search)) return false;
    }
    return true;
  }), [satellites, typeFilter, countryFilter, search]);

  const resolveColor = useCallback((sat: SatelliteData, idx: number) => {
    if (groupBy === 'TYPE')    return TYPE_COLORS[sat.object_type || 'UNKNOWN'] ?? '#94a3b8';
    if (groupBy === 'COUNTRY') return PALETTE[countries.indexOf(sat.country || 'UNKNOWN') % PALETTE.length];
    return safeHex(sat.color, idx);
  }, [groupBy, countries]);

  const project = useCallback((px: number, py: number, pz: number, cx: number, cy: number) => {
    const { x: rx, y: ry } = rotRef.current;
    const z0 = zoomRef.current;
    const cy_ = Math.cos(ry), sy_ = Math.sin(ry);
    const cx_ = Math.cos(rx), sx_ = Math.sin(rx);
    const x1 = px*cy_ - pz*sy_;
    const z1 = px*sy_ + pz*cy_;
    const y2 = py*cx_ - z1*sx_;
    const z2 = py*sx_ + z1*cx_;
    const fov = 2.8;
    const d   = fov / (fov - z2 / (R * 2));
    const sc  = Math.min(cx*2, cy*2) / (R*6) * z0;
    return { sx: cx + x1*sc*d, sy: cy - y2*sc*d, depth: z2 };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2;

    ctx.fillStyle = '#050d18';
    ctx.fillRect(0,0,W,H);

    for (let i = 0; i < 350; i++) {
      const sx = Math.abs(Math.sin(i*127.1+3)*W) % W;
      const sy = Math.abs(Math.sin(i*311.7+7)*H) % H;
      const a  = 0.25 + Math.abs(Math.sin(i*73.9))*0.55;
      const sr = 0.4  + Math.abs(Math.sin(i*19.3))*0.8;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
    }

    const er = Math.min(cx, cy)*0.28*zoomRef.current;
    const eg  = ctx.createRadialGradient(cx-er*0.3, cy-er*0.3, 0, cx, cy, er);
    eg.addColorStop(0,'#2563eb'); eg.addColorStop(0.5,'#1d4ed8'); eg.addColorStop(1,'#0c2461');
    ctx.beginPath(); ctx.arc(cx,cy,er,0,Math.PI*2); ctx.fillStyle = eg; ctx.fill();

    ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,er-1,0,Math.PI*2); ctx.clip();
    ctx.fillStyle = 'rgba(30,110,50,0.55)';
    for (const [ox,oy,rx_,ry_] of [[-0.3,0.22,0.24,0.19],[0.1,0.17,0.17,0.21],[-0.05,-0.15,0.11,0.14],[0.35,0.1,0.19,0.24],[0.44,-0.2,0.14,0.11]]) {
      ctx.beginPath(); ctx.ellipse(cx+ox*er, cy-oy*er, rx_*er, ry_*er, ox*0.4, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    const ag = ctx.createRadialGradient(cx,cy,er*0.92,cx,cy,er*1.22);
    ag.addColorStop(0,'rgba(96,165,250,0.18)'); ag.addColorStop(1,'rgba(96,165,250,0)');
    ctx.beginPath(); ctx.arc(cx,cy,er*1.22,0,Math.PI*2); ctx.fillStyle = ag; ctx.fill();

    const pts = visible.map((sat, i) => {
      const path = sat.orbitPath;
      const pos  = path?.length ? path[Math.floor(path.length/4)] : ([R*1.5,0,0] as [number,number,number]);
      return { sat, path, proj: project(pos[0],pos[1],pos[2],cx,cy), color: resolveColor(sat,i) };
    }).sort((a,b) => a.proj.depth - b.proj.depth);

    for (const { path, color } of pts) {
      if (!path?.length) continue;
      ctx.beginPath();
      let first = true;
      for (const pt of path) {
        const p = project(pt[0],pt[1],pt[2],cx,cy);
        first ? ctx.moveTo(p.sx,p.sy) : ctx.lineTo(p.sx,p.sy);
        first = false;
      }
      ctx.strokeStyle = toRgba(color,0.22); ctx.lineWidth = 0.8; ctx.stroke();
    }

    for (const { sat, proj: { sx, sy }, color } of pts) {
      const isSel = selected?.id === sat.id;
      const dotR  = isSel ? 6 : 4;

      const gl = ctx.createRadialGradient(sx,sy,0,sx,sy,dotR*3.5);
      gl.addColorStop(0, toRgba(color, isSel ? 0.95 : 0.65));
      gl.addColorStop(1, toRgba(color, 0));
      ctx.beginPath(); ctx.arc(sx,sy,dotR*3.5,0,Math.PI*2); ctx.fillStyle = gl; ctx.fill();
      ctx.beginPath(); ctx.arc(sx,sy,dotR,0,Math.PI*2); ctx.fillStyle = color; ctx.fill();

      if (isSel) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx,sy,dotR+6,0,Math.PI*2);
        ctx.strokeStyle = toRgba(color,0.5); ctx.lineWidth = 1; ctx.stroke();
      }

      if (zoomRef.current > 1.4 || isSel) {
        const label = sat.name.length > 14 ? sat.name.slice(0,14)+'…' : sat.name;
        ctx.font      = `${isSel?'bold ':''}${Math.round(Math.max(9,10*zoomRef.current))}px monospace`;
        ctx.fillStyle = isSel ? '#fff' : 'rgba(255,255,255,0.78)';
        ctx.fillText(label, sx+dotR+4, sy+4);
      }
    }

    ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.fillText(`${visible.length} объектов  ·  zoom ${zoomRef.current.toFixed(1)}×`, 12, H-12);
    if (groupBy !== 'NONE') ctx.fillText(`Цвет по: ${groupBy === 'TYPE' ? 'типу' : 'стране'}`, 12, H-28);
  }, [visible, selected, groupBy, project, resolveColor]);

  useEffect(() => {
    let id: number;
    const loop = () => { draw(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; });
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    ro.observe(canvas); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const fn = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.3, Math.min(10, zoomRef.current - e.deltaY*0.001));
      forceRender(n => n+1);
    };
    canvas.addEventListener('wheel', fn, { passive: false });
    return () => canvas.removeEventListener('wheel', fn);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => { dragRef.current = { active:true, lx:e.clientX, ly:e.clientY }; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    rotRef.current.y += (e.clientX - dragRef.current.lx)*0.005;
    rotRef.current.x  = Math.max(-1.3, Math.min(1.3, rotRef.current.x + (e.clientY - dragRef.current.ly)*0.005));
    dragRef.current.lx = e.clientX; dragRef.current.ly = e.clientY;
  };
  const onMouseUp = () => { dragRef.current.active = false; };

  const onClick = (e: React.MouseEvent) => {
    if (Math.abs(e.movementX)+Math.abs(e.movementY) > 4) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX-rect.left, my = e.clientY-rect.top;
    const cx = canvas.width/2, cy = canvas.height/2;
    let best: SatelliteData | null = null, bestD = 18;
    for (const sat of visible) {
      const path = sat.orbitPath;
      const pos  = path?.length ? path[Math.floor(path.length/4)] : ([R*1.5,0,0] as [number,number,number]);
      const { sx, sy } = project(pos[0],pos[1],pos[2],cx,cy);
      const d = Math.hypot(sx-mx, sy-my);
      if (d < bestD) { bestD = d; best = sat; }
    }
    const next = selected?.id === best?.id ? null : best;
    setSelected(next); onSelectSatellite?.(next);
  };

  const changeZoom = (delta: number) => {
    zoomRef.current = Math.max(0.3, Math.min(10, zoomRef.current+delta));
    forceRender(n => n+1);
  };
  const resetView = () => { rotRef.current = { x:0.35, y:0 }; zoomRef.current = 1; forceRender(n => n+1); };

  const filtersActive = typeFilter !== 'ALL' || countryFilter !== 'ALL' || search !== '';

  return (
    <div className="relative w-full h-full bg-[#050d18] overflow-hidden" style={{ userSelect:'none' }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onClick}
      />

      {/* Filters */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <button
          onClick={() => setShowFilters(f => !f)}
          className={[
            'flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors',
            filtersActive ? 'bg-blue-600/80 border-blue-500 text-white' : 'bg-black/60 border-white/10 text-slate-300 hover:bg-black/80',
          ].join(' ')}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M11 12h2"/>
          </svg>
          Фильтры{filtersActive ? ' ✓' : ''}
        </button>

        {showFilters && (
          <div className="bg-black/85 border border-white/10 rounded-xl p-3 space-y-3 backdrop-blur-sm w-60 shadow-2xl">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Имя / NORAD ID…"
              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 placeholder:text-slate-500 outline-none focus:border-blue-400"
            />

            <div className="space-y-1">
              <p className="text-xs text-slate-500">Тип объекта</p>
              <div className="flex flex-wrap gap-1">
                {OBJECT_TYPES.map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={['text-xs px-2 py-0.5 rounded-full border transition-colors', typeFilter===t ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/10 text-slate-400 hover:border-white/30'].join(' ')}>
                    {t==='ALL' ? 'Все' : t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500">Страна</p>
              <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-slate-200 outline-none">
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500">Цвет по группе</p>
              <div className="flex gap-1">
                {GROUP_OPTIONS.map(g => (
                  <button key={g} onClick={() => setGroupBy(g)}
                    className={['flex-1 text-xs py-1 rounded-lg border transition-colors', groupBy===g ? 'bg-purple-600 border-purple-500 text-white' : 'border-white/10 text-slate-400 hover:border-white/30'].join(' ')}>
                    {g==='NONE'?'Нет':g==='TYPE'?'Тип':'Страна'}
                  </button>
                ))}
              </div>
            </div>

            {(filtersActive || groupBy!=='NONE') && (
              <button onClick={() => { setTypeFilter('ALL'); setCountryFilter('ALL'); setSearch(''); setGroupBy('NONE'); }}
                className="w-full text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg py-1 transition-colors">
                Сбросить всё
              </button>
            )}
          </div>
        )}
      </div>

      {/* Zoom */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        {([{l:'+',f:()=>changeZoom(0.4)},{l:'−',f:()=>changeZoom(-0.4)},{l:'⟳',f:resetView}] as const).map(b => (
          <button key={b.l} onClick={b.f}
            className="w-8 h-8 bg-black/60 hover:bg-black/85 border border-white/10 rounded-lg text-slate-300 text-base leading-none backdrop-blur-sm transition-colors">
            {b.l}
          </button>
        ))}
      </div>

      {/* Type legend */}
      {groupBy === 'TYPE' && (
        <div className="absolute bottom-12 left-3 z-10 bg-black/70 border border-white/10 rounded-xl px-3 py-2 space-y-1 backdrop-blur-sm">
          {Object.entries(TYPE_COLORS).map(([t,c]) => (
            <div key={t} className="flex items-center gap-2 text-xs text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background:c }}/>
              {t}
            </div>
          ))}
        </div>
      )}

      {/* Selected info */}
      {selected && (
        <div className="absolute bottom-12 right-3 z-10 w-64 bg-black/85 border border-white/10 rounded-2xl p-4 space-y-3 backdrop-blur-sm shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-white text-sm leading-tight">{selected.name}</p>
            <button onClick={() => { setSelected(null); onSelectSatellite?.(null); }} className="text-slate-500 hover:text-white shrink-0 mt-0.5">
              <X className="w-4 h-4"/>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {([['NORAD ID',selected.norad_id],['Тип',selected.object_type||'—'],['Страна',selected.country||'—']] as [string,string][]).map(([k,v]) => (
              <div key={k} className="contents">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-200 font-mono">{v}</span>
              </div>
            ))}
          </div>
          {(selected.tle_line1 || selected.tle_line2) && (
            <div className="border-t border-white/10 pt-2 space-y-1.5">
              {selected.tle_line1 && <div>
                <p className="text-[10px] text-slate-500 mb-0.5">TLE Line 1</p>
                <p className="font-mono text-[9px] text-slate-300 break-all leading-tight">{selected.tle_line1}</p>
              </div>}
              {selected.tle_line2 && <div>
                <p className="text-[10px] text-slate-500 mb-0.5">TLE Line 2</p>
                <p className="font-mono text-[9px] text-slate-300 break-all leading-tight">{selected.tle_line2}</p>
              </div>}
            </div>
          )}
        </div>
      )}

      {!selected && visible.length > 0 && (
        <p className="absolute bottom-3 right-3 text-xs text-slate-600 pointer-events-none">
          Скролл — zoom · Drag — вращение · Клик — выбор
        </p>
      )}
    </div>
  );
}
