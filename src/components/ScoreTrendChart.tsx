import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartSeries {
  key: string;
  name: string;
  /** The manager's signature neon color - see src/lib/teamColors.ts. */
  color: string;
}

const GRID_COLOR = "rgba(120, 132, 165, 0.16)";
const AXIS_COLOR = "#767f99";

export function ScoreTrendChart({
  data,
  series,
  xKey,
  yLabel,
}: {
  data: Record<string, number | string>[];
  series: ChartSeries[];
  xKey: string;
  yLabel?: string;
}) {
  return (
    // Height is CSS-driven so it can shrink on phones without a JS media query.
    <div className="h-[260px] w-full sm:h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey={xKey} stroke={AXIS_COLOR} fontSize={12} tickLine={false} />
        <YAxis
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
      </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
