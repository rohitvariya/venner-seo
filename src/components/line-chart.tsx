// Small dependency-free SVG line chart for daily clicks / impressions.

export function LineChart({
  points,
  color = "#4f46e5",
  height = 140,
}: {
  points: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  if (points.length < 2) return <div className="flex h-[140px] items-center justify-center text-sm text-slate-400">Not enough data yet</div>;
  const w = 600;
  const max = Math.max(1, ...points.map((p) => p.value));
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, height - (p.value / max) * (height - 10) - 5] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
        <path d={area} fill={color} opacity={0.08} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{points[0].label}</span>
        <span>max {max.toLocaleString()}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
