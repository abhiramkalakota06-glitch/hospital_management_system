import React from 'react';

export const BarChart: React.FC<{
  title: string;
  subtitle?: string;
  data: { label: string; value: number; secondary?: string }[];
  color?: string;
  valuePrefix?: string;
}> = ({ title, subtitle, data, color = '#0284C7', valuePrefix = '' }) => {
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No chart data available</p>
      ) : (
        <div className="space-y-3">
          {data.map((item) => {
            const pct = Math.round((item.value / maxVal) * 100);
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 truncate max-w-[65%]">{item.label}</span>
                  <span className="font-mono tabular-nums text-slate-900 font-semibold">
                    {valuePrefix}
                    {item.value.toLocaleString()}
                    {item.secondary ? ` · ${item.secondary}` : ''}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(4, pct)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const TrendChart: React.FC<{
  title: string;
  subtitle?: string;
  points: { label: string; value: number }[];
  strokeColor?: string;
  valuePrefix?: string;
}> = ({ title, subtitle, points, strokeColor = '#0D9488', valuePrefix = '' }) => {
  const width = 480;
  const height = 160;
  const padX = 28;
  const padY = 20;
  const max = Math.max(1, ...points.map((p) => p.value));

  const coords = points.map((p, i) => {
    const x = points.length <= 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - (p.value / max) * (height - padY * 2);
    return { x, y, ...p };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const area =
    coords.length > 0
      ? `M ${coords[0].x},${height - padY} L ${coords.map((c) => `${c.x},${c.y}`).join(' L ')} L ${coords[coords.length - 1].x},${height - padY} Z`
      : '';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {points.length > 0 && (
          <span className="text-xs font-mono tabular-nums font-semibold text-teal-700">
            Latest: {valuePrefix}
            {points[points.length - 1].value.toLocaleString()}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible">
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#E2E8F0" strokeWidth="1" />
        <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />
        {area && <path d={area} fill={strokeColor} fillOpacity="0.1" />}
        {polyline && <polyline fill="none" stroke={strokeColor} strokeWidth="2.5" points={polyline} strokeLinejoin="round" strokeLinecap="round" />}
        {coords.map((c) => (
          <g key={c.label}>
            <circle cx={c.x} cy={c.y} r="4" fill="#FFFFFF" stroke={strokeColor} strokeWidth="2" />
            <text x={c.x} y={height - 4} textAnchor="middle" className="fill-slate-500 text-[10px] font-sans">
              {c.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export const DonutBreakdown: React.FC<{
  title: string;
  segments: { label: string; value: number; color: string }[];
}> = ({ title, segments }) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="flex items-center gap-6">
        <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0 -rotate-90">
          <circle cx="56" cy="56" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="14" />
          {total > 0 &&
            segments.map((seg) => {
              const dash = (seg.value / total) * circumference;
              const currentOffset = offset;
              offset += dash;
              return (
                <circle
                  key={seg.label}
                  cx="56"
                  cy="56"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-currentOffset}
                />
              );
            })}
        </svg>
        <div className="flex-1 space-y-2">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                <span>{seg.label}</span>
              </div>
              <span className="font-mono tabular-nums font-semibold text-slate-900">{seg.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
