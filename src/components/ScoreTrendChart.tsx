import { useId } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";

export interface ChartSeries {
  key: string;
  name: string;
  /** The manager's signature neon color - see src/lib/teamColors.ts. */
  color: string;
  /** Drawn at the end of this series' line, so each line can be read
   * straight off the chart instead of matched to the legend by colour -
   * fourteen neon lines is more colours than anyone can hold in their
   * head. */
  avatarUrl?: string;
}

/** Largest an end-of-line avatar gets; shrunk when there isn't room to
 * stack every one of them without overlap. */
const AVATAR_MAX = 22;
/** Floor for that shrinking. Deliberately small: a tiny avatar is still
 * a readable dot of team colour, while one pushed outside the plot sits
 * on top of the axis or the legend. */
const AVATAR_MIN = 8;
const AVATAR_GAP = 2;
/**
 * Space between a line's last point and its avatar. Wide enough that a
 * leader to an avatar pushed away from its line runs visibly diagonal -
 * at a few pixels they came out near-vertical and vanished behind the
 * column of photos, which is exactly when a reader needs them.
 */
const AVATAR_OFFSET = 18;

/**
 * Each series' photo at the end of its line.
 *
 * Rendered inside the chart so it can use the chart's own axis scales -
 * the avatars land on the true pixel position of each line's last point
 * rather than an estimate of it.
 *
 * Lines that finish close together would put their avatars on top of one
 * another (a dozen ratings within 20 points of 1500 is the normal case),
 * so the avatars are stacked apart vertically and any that had to move
 * get a short leader back to where their line actually ends.
 */
function EndAvatars({
  data,
  series,
  xKey,
}: {
  data: Record<string, number | string>[];
  series: ChartSeries[];
  xKey: string;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  // clipPath ids are document-global, so they have to be unique per chart.
  const uid = useId().replace(/:/g, "");
  if (!xScale || !yScale || !plot) return null;

  const ends: { s: ChartSeries; x: number; y: number }[] = [];
  for (const s of series) {
    if (!s.avatarUrl) continue;
    for (let i = data.length - 1; i >= 0; i--) {
      const value = data[i][s.key];
      if (typeof value !== "number") continue;
      const x = xScale(data[i][xKey]);
      const y = yScale(value);
      if (x !== undefined && y !== undefined) ends.push({ s, x, y });
      break;
    }
  }
  if (ends.length === 0) return null;

  // Shrink to fit before stacking, so a short phone-height chart still
  // has room for every avatar instead of pushing some off the bottom.
  const size = Math.max(
    AVATAR_MIN,
    Math.min(AVATAR_MAX, plot.height / ends.length - AVATAR_GAP),
  );
  const step = size + AVATAR_GAP;
  const top = plot.y + size / 2;
  const bottom = plot.y + plot.height - size / 2;

  ends.sort((a, b) => a.y - b.y);
  const placed = ends.map((e) => Math.min(Math.max(e.y, top), bottom));
  // Push apart downwards, then back up if that ran off the bottom.
  for (let i = 1; i < placed.length; i++) {
    placed[i] = Math.max(placed[i], placed[i - 1] + step);
  }
  if (placed[placed.length - 1] > bottom) {
    placed[placed.length - 1] = bottom;
    for (let i = placed.length - 2; i >= 0; i--) {
      placed[i] = Math.min(placed[i], placed[i + 1] - step);
    }
  }

  return (
    <g className="end-avatars">
      {ends.map((e, i) => {
        const cy = placed[i];
        const cx = e.x + AVATAR_OFFSET + size / 2;
        const clipId = `${uid}-avatar-${i}`;
        return (
          <g key={e.s.key}>
            {Math.abs(cy - e.y) > 1 && (
              <line
                x1={e.x}
                y1={e.y}
                x2={cx - size / 2}
                y2={cy}
                stroke={e.s.color}
                strokeOpacity={0.85}
                strokeWidth={1.25}
              />
            )}
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={size / 2} />
            </clipPath>
            {/* Filled first, so a photo that fails to load still leaves
                a circle in the team's colour rather than a hole. */}
            <circle cx={cx} cy={cy} r={size / 2} fill={e.s.color} fillOpacity={0.35} />
            <image
              href={e.s.avatarUrl}
              x={cx - size / 2}
              y={cy - size / 2}
              width={size}
              height={size}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
            >
              <title>{e.s.name}</title>
            </image>
            <circle
              cx={cx}
              cy={cy}
              r={size / 2}
              fill="none"
              stroke={e.s.color}
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </g>
  );
}

const GRID_COLOR = "rgba(120, 132, 165, 0.16)";
const AXIS_COLOR = "#767f99";

export function ScoreTrendChart({
  data,
  series,
  xKey,
  yLabel,
  fitY = false,
}: {
  data: Record<string, number | string>[];
  series: ChartSeries[];
  xKey: string;
  yLabel?: string;
  /**
   * Fit the y-axis to the data instead of starting it at zero. Right for
   * a rating that lives in a narrow band far from zero - Elo sits around
   * 1350-1650, and a 0-based axis squashes every line into a flat stripe
   * along the top. Wrong for points, where zero is a real baseline.
   */
  fitY?: boolean;
}) {
  const hasAvatars = series.some((s) => s.avatarUrl);
  return (
    // Height is CSS-driven so it can shrink on phones without a JS media
    // query. Taller on phones when there are avatars: the legend wraps to
    // several rows at that width and takes its height out of the plot,
    // which left too little room to stack a photo for every line - five
    // of fourteen were landing outside the chart.
    <div
      className={`w-full ${hasAvatars ? "h-[420px] sm:h-[440px]" : "h-[260px] sm:h-[360px]"}`}
    >
      <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        // Room on the right for the end-of-line avatars.
        margin={{ top: 8, right: hasAvatars ? AVATAR_MAX + AVATAR_OFFSET + 4 : 8, bottom: 8, left: -8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey={xKey} stroke={AXIS_COLOR} fontSize={12} tickLine={false} />
        <YAxis
          // Rounded out to the nearest 25 past the data so the lines never
          // touch the frame and the ticks land on readable numbers.
          domain={
            fitY
              ? [
                  (min: number) => Math.floor((min - 10) / 25) * 25,
                  (max: number) => Math.ceil((max + 10) / 25) * 25,
                ]
              : undefined
          }
          stroke={AXIS_COLOR}
          fontSize={12}
          tickLine={false}
          label={
            yLabel
              ? { value: yLabel, angle: -90, position: "insideLeft", fill: AXIS_COLOR, fontSize: 12 }
              : undefined
          }
        />
        <Tooltip
          contentStyle={{
            background: "#0c0e16",
            border: "1px solid #1c2233",
            borderRadius: 10,
            fontSize: 12,
            boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
          }}
          labelStyle={{ color: "#eef2ff" }}
          itemStyle={{ color: "#b9c1d9" }}
          cursor={{ stroke: "rgba(120,132,165,0.35)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#b9c1d9" }} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
        {hasAvatars && <EndAvatars data={data} series={series} xKey={xKey} />}
      </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
