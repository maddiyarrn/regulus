'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { X, Satellite, Filter, Layers } from 'lucide-react';

export interface SatelliteData {
  id: number;
  name: string;
  norad_id: string;
  object_type?: string;
  country?: string;
  orbitPath?: [number, number, number][];
  color?: string;
}

interface Props {
  satellites: SatelliteData[];
  onSelectSatellite?: (id: number | null) => void;
}

const EARTH_RADIUS_KM = 6371;

const TYPE_COLORS: Record<string, string> = {
  'PAYLOAD':         '#60a5fa',
  'ROCKET BODY':     '#f87171',
  'DEBRIS':          '#94a3b8',
  'UNKNOWN':         '#fbbf24',
  'TBA':             '#a78bfa',
};

const PALETTE = ['#60a5fa','#34d399','#f59e0b','#f87171','#a78bfa','#38bdf8','#fb923c','#4ade80','#e879f9','#fbbf24','#2dd4bf','#f472b6'];

function safeColor(sat: SatelliteData, index: number): string {
  if (sat.color && sat.color.startsWith('#') && sat.color.length >= 7) return sat.color;
  if (sat.object_type && TYPE_COLORS[sat.object_type.toUpperCase()]) return TYPE_COLORS[sat.object_type.toUpperCase()];
  return PALETTE[index % PALETTE.length];
}

function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const STARS = Array.from({ length: 120 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.2 + 0.3,
  a: Math.random() * 0.6 + 0.3,
}));

export default function OrbitCanvas({ satellites, onSelectSatellite }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const rotRef = useRef({ x: 0.3, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRotateRef = useRef(true);

  const [selected, setSelected] = useState<SatelliteData | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterCountry, setFilterCountry] = useState<string>('ALL');
  const [showOrbits, setShowOrbits] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const types = useMemo(() => {
    const s = new Set(satellites.map(s => s.object_type?.toUpperCase() || 'UNKNOWN'));
    return ['ALL', ...Array.from(s).sort()];
  }, [satellites]);

  const countries = useMemo(() => {
    const s = new Set(satellites.map(s => s.country || 'Unknown'));
    return ['ALL', ...Array.from(s).sort()];
  }, [satellites]);

  const filtered = useMemo(() => satellites.filter(s => {
    if (filterType !== 'ALL' && (s.object_type?.toUpperCase() || 'UNKNOWN') !== filterType) return false;
    if (filterCountry !== 'ALL' && (s.country || 'Unknown') !== filterCountry) return false;
    return true;
  }), [satellites, filterType, filterCountry]);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of satellites) {
      const t = s.object_type?.toUpperCase() || 'UNKNOWN';
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [satellites]);

  const project = useCallback(
    (x: number, y: number, z: number, cx: number, cy: number, scale: number) => {
      const cosY = Math.cos(rotRef.current.y);
      const sinY = Math.sin(rotRef.current.y);
      const cosX = Math.cos(rotRef.current.x);
      const sinX = Math.sin(rotRef.current.x);
      const rx = x * cosY + z * sinY;
      const ry = y;
      const rz = -x * sinY + z * cosY;
      const ry2 = ry * cosX - rz * sinX;
      const rz2 = ry * sinX + rz * cosX;
      const fov = 2.5;
      const d = fov / (fov + rz2 / (EARTH_RADIUS_KM * 2));
      return {
        sx: cx + rx * scale * d,
        sy: cy - ry2 * scale * d,
        depth: rz2,
      };
    },
    []
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const baseScale = Math.min(W, H) / (EARTH_RADIUS_KM * 5.5);
    const scale = baseScale * zoomRef.current;

    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, W, H);

    for (const st of STARS) {
      ctx.beginPath();
      ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${st.a})`;
      ctx.fill();
    }

    const R = EARTH_RADIUS_KM;

    const earthGrad = ctx.createRadialGradient(cx - R * scale * 0.3, cy - R * scale * 0.3, 0, cx, cy, R * scale);
    earthGrad.addColorStop(0, '#2a7fcf');
    earthGrad.addColorStop(0.4, '#1a5ea0');
    earthGrad.addColorStop(0.7, '#0f3d6b');
    earthGrad.addColorStop(1, '#071f38');
    ctx.beginPath();
    ctx.arc(cx, cy, R * scale, 0, Math.PI * 2);
    ctx.fillStyle = earthGrad;
    ctx.fill();

    const continents = [
      { ox: -0.3, oy: 0.2, rx: 0.25, ry: 0.18, angle: -0.2 },
      { ox: 0.1, oy: 0.15, rx: 0.18, ry: 0.22, angle: 0.1 },
      { ox: -0.05, oy: -0.15, rx: 0.12, ry: 0.14, angle: 0.3 },
      { ox: 0.35, oy: 0.1, rx: 0.2, ry: 0.24, angle: -0.1 },
      { ox: 0.45, oy: -0.22, rx: 0.14, ry: 0.11, angle: 0.2 },
      { ox: -0.45, oy: -0.1, rx: 0.08, ry: 0.06, angle: 0 },
    ];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * scale - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(34,120,60,0.5)';
    for (const c of continents) {
      ctx.beginPath();
      ctx.ellipse(cx + c.ox * R * scale, cy - c.oy * R * scale, c.rx * R * scale, c.ry * R * scale, c.angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const atmGrad = ctx.createRadialGradient(cx, cy, R * scale * 0.96, cx, cy, R * scale * 1.2);
    atmGrad.addColorStop(0, 'rgba(96,165,250,0.18)');
    atmGrad.addColorStop(1, 'rgba(96,165,250,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R * scale * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = atmGrad;
    ctx.fill();

    for (let si = 0; si < filtered.length; si++) {
      const sat = filtered[si];
      const color = safeColor(sat, si);
      const isSelected = selected?.id === sat.id;

      if (showOrbits && sat.orbitPath && sat.orbitPath.length > 1) {
        ctx.beginPath();
        let started = false;
        for (const [px, py, pz] of sat.orbitPath) {
          const p = project(px, py, pz, cx, cy, scale);
          if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.strokeStyle = isSelected ? rgba(color, 0.9) : rgba(color, 0.25);
        ctx.lineWidth = isSelected ? 1.5 : 0.8;
        ctx.stroke();
      }

      const pos = sat.orbitPath?.[0] ?? [R * 1.5, 0, 0] as [number, number, number];
      const p = project(pos[0], pos[1], pos[2], cx, cy, scale);
      const dotR = isSelected ? 6 : 4;

      const glow = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, dotR * 3);
      glow.addColorStop(0, rgba(color, isSelected ? 0.9 : 0.6));
      glow.addColorStop(1, rgba(color, 0));
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, dotR * 3, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (showLabels || isSelected) {
        ctx.fillStyle = isSelected ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.7)';
        ctx.font = isSelected ? 'bold 11px monospace' : '9px monospace';
        const label = sat.name.length > 14 ? sat.name.slice(0, 14) + '…' : sat.name;
        ctx.fillText(label, p.sx + dotR + 4, p.sy + 4);
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px monospace';
    ctx.fillText(`${filtered.length} / ${satellites.length} объектов`, 12, H - 12);
    ctx.fillText(`zoom: ${zoomRef.current.toFixed(1)}x`, 12, H - 28);
  }, [filtered, selected, showOrbits, showLabels, project, satellites.length]);

  useEffect(() => {
    let running = true;
    const animate = () => {
      if (!running) return;
      if (autoRotateRef.current) rotRef.current.y += 0.0015;
      draw();
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomRef.current = Math.max(0.3, Math.min(8, zoomRef.current * delta));
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    autoRotateRef.current = false;
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    rotRef.current.y += (e.clientX - dragRef.current.lastX) * 0.005;
    rotRef.current.x += (e.clientY - dragRef.current.lastY) * 0.005;
    rotRef.current.x = Math.max(-1.4, Math.min(1.4, rotRef.current.x));
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (dragRef.current.active && Math.abs(e.clientX - dragRef.current.lastX) < 2 && Math.abs(e.clientY - dragRef.current.lastY) < 2) {
      handleClick(e);
    }
    dragRef.current.active = false;
  };

  // Touch support
  const touchRef = useRef({ lastX: 0, lastY: 0, dist: 0 });
  const onTouchStart = (e: React.TouchEvent) => {
    autoRotateRef.current = false;
    if (e.touches.length === 1) {
      touchRef.current.lastX = e.touches[0].clientX;
      touchRef.current.lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current.dist = Math.hypot(dx, dy);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      rotRef.current.y += (e.touches[0].clientX - touchRef.current.lastX) * 0.005;
      rotRef.current.x += (e.touches[0].clientY - touchRef.current.lastY) * 0.005;
      rotRef.current.x = Math.max(-1.4, Math.min(1.4, rotRef.current.x));
      touchRef.current.lastX = e.touches[0].clientX;
      touchRef.current.lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      zoomRef.current = Math.max(0.3, Math.min(8, zoomRef.current * (dist / touchRef.current.dist)));
      touchRef.current.dist = dist;
    }
  };

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const baseScale = Math.min(W, H) / (EARTH_RADIUS_KM * 5.5);
    const scale = baseScale * zoomRef.current;
    const R = EARTH_RADIUS_KM;

    let closest: SatelliteData | null = null;
    let closestDist = 16;

    for (const sat of filtered) {
      const pos = sat.orbitPath?.[0] ?? [R * 1.5, 0, 0] as [number, number, number];
      const p = project(pos[0], pos[1], pos[2], cx, cy, scale);
      const d = Math.hypot(mx - p.sx, my - p.sy);
      if (d < closestDist) { closestDist = d; closest = sat; }
    }

    if (closest) {
      setSelected(prev => prev?.id === closest!.id ? null : closest);
      onSelectSatellite?.(closest.id);
    } else {
      setSelected(null);
      onSelectSatellite?.(null);
    }
  }, [filtered, project, onSelectSatellite]);

  return (
    <div className="relative w-full h-full bg-[#030712] select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragRef.current.active = false; }}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => {}}
      />

      {/* Controls hint */}
      <div className="absolute bottom-3 right-3 text-[10px] text-white/30 font-mono text-right pointer-events-none space-y-0.5">
        <div>scroll — zoom</div>
        <div>drag — rotate</div>
        <div>click — select</div>
      </div>

      {/* Top toolbar */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors backdrop-blur-sm border ${showFilters ? 'bg-white/20 border-white/30 text-white' : 'bg-black/40 border-white/10 text-white/70 hover:bg-black/60'}`}
        >
          <Filter className="w-3 h-3" />
          Фильтры
          {(filterType !== 'ALL' || filterCountry !== 'ALL') && (
            <span className="bg-blue-500 rounded-full w-1.5 h-1.5" />
          )}
        </button>
        <button
          onClick={() => setShowOrbits(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors backdrop-blur-sm border ${showOrbits ? 'bg-white/20 border-white/30 text-white' : 'bg-black/40 border-white/10 text-white/50'}`}
        >
          Орбиты
        </button>
        <button
          onClick={() => setShowLabels(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors backdrop-blur-sm border ${showLabels ? 'bg-white/20 border-white/30 text-white' : 'bg-black/40 border-white/10 text-white/50'}`}
        >
          Метки
        </button>
        <button
          onClick={() => { autoRotateRef.current = !autoRotateRef.current; }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors backdrop-blur-sm border bg-black/40 border-white/10 text-white/70 hover:bg-black/60"
        >
          Авто
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="absolute top-12 left-3 w-64 rounded-xl bg-black/80 backdrop-blur-sm border border-white/10 p-4 space-y-4 text-white text-xs z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold">
              <Layers className="w-3.5 h-3.5" />
              Фильтры и группы
            </div>
            <button onClick={() => setShowFilters(false)}><X className="w-3.5 h-3.5 text-white/50 hover:text-white" /></button>
          </div>

          {/* Type filter with counts */}
          <div className="space-y-1.5">
            <p className="text-white/50 uppercase tracking-wide text-[10px]">Тип объекта</p>
            <div className="space-y-1">
              {types.map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors ${filterType === t ? 'bg-white/20' : 'hover:bg-white/10'}`}
                >
                  <div className="flex items-center gap-2">
                    {t !== 'ALL' && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[t] || '#94a3b8' }} />
                    )}
                    <span>{t === 'ALL' ? 'Все типы' : t}</span>
                  </div>
                  <span className="text-white/40">{t === 'ALL' ? satellites.length : (groupCounts[t] || 0)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Country filter */}
          <div className="space-y-1.5">
            <p className="text-white/50 uppercase tracking-wide text-[10px]">Страна</p>
            <select
              value={filterCountry}
              onChange={e => setFilterCountry(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
            >
              {countries.map(c => <option key={c} value={c} className="bg-gray-900">{c === 'ALL' ? 'Все страны' : c}</option>)}
            </select>
          </div>

          {(filterType !== 'ALL' || filterCountry !== 'ALL') && (
            <button
              onClick={() => { setFilterType('ALL'); setFilterCountry('ALL'); }}
              className="w-full px-2 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}

      {/* Selected satellite info panel */}
      {selected && (
        <div className="absolute top-3 right-3 w-60 rounded-xl bg-black/85 backdrop-blur-sm border border-white/10 p-4 text-white text-xs space-y-3 z-10">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Satellite className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span className="font-semibold leading-tight">{selected.name}</span>
            </div>
            <button onClick={() => { setSelected(null); onSelectSatellite?.(null); }}>
              <X className="w-3.5 h-3.5 text-white/50 hover:text-white shrink-0" />
            </button>
          </div>
          <div className="space-y-1.5 text-white/70">
            <div className="flex justify-between">
              <span className="text-white/40">NORAD ID</span>
              <span className="font-mono">{selected.norad_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Тип</span>
              <span className="flex items-center gap-1.5">
                {selected.object_type && (
                  <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[selected.object_type.toUpperCase()] || '#94a3b8' }} />
                )}
                {selected.object_type || 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Страна</span>
              <span>{selected.country || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Орбит. точек</span>
              <span>{selected.orbitPath?.length ?? 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
