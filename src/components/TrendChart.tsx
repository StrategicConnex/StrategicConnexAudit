/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT TrendChart — línea de tendencia SVG ligera (sin recharts: el
   portal público debe pesar poco). Normaliza min/max, marca el último
   punto y expone tabla oculta para lectores de pantalla.
   Semana 9 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export interface TrendPoint {
  label: string;
  value: number;
}

const W = 600;
const H = 220;
const PAD = 16;

export function trendCoords(points: TrendPoint[]): string {
  if (points.length === 0) return '';
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const flat = max === min;
  const span = max - min || 1;
  const stepX =
    points.length === 1 ? 0 : (W - PAD * 2) / (points.length - 1);
  return points
    .map((p, i) => {
      const x = PAD + i * stepX;
      // Línea plana → centrada para que no parezca un cero.
      const y = flat ? H / 2 : H - PAD - ((p.value - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function TrendChart({
  points,
  ariaLabel,
  accent = '#D4A843',
  emptyLabel,
}: {
  points: TrendPoint[];
  ariaLabel: string;
  accent?: string;
  emptyLabel: string;
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-xs text-muted-fg">{emptyLabel}</p>;
  }
  const coords = trendCoords(points);
  const last = points[points.length - 1]!;
  const [lastX, lastY] = coords.split(' ').pop()!.split(',');

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-48 w-full"
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <polyline
          points={coords}
          fill="none"
          stroke={accent}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lastX} cy={lastY} r="5" fill={accent} />
        <circle cx={lastX} cy={lastY} r="9" fill={accent} opacity="0.25" />
      </svg>
      <div className="mt-1 flex justify-between text-2xs tabular-nums text-muted-fg">
        <span>{points[0]!.label}</span>
        <span className="font-extrabold" style={{ color: accent }}>
          {last.value}/100
        </span>
        <span>{last.label}</span>
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
