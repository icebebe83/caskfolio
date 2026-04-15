"use client";

import { useLanguage } from "@/components/providers";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatUsd } from "@/lib/format";

interface ChartPoint {
  date: string;
  timestamp?: number;
  price: number | null;
}

export function PriceHistoryChart({
  points,
  referencePrice,
}: {
  points: ChartPoint[];
  referencePrice?: number | null;
}) {
  const { language } = useLanguage();
  const hasReferenceLine =
    typeof referencePrice === "number" && Number.isFinite(referencePrice);

  return (
    <div className="panel h-[320px] p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} />
          <YAxis
            tickFormatter={(value: number) => `$${value}`}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            formatter={(value, _name, item) => {
              return [
                formatUsd(Number(value ?? 0)),
                item.dataKey === "price"
                  ? "Caskfolio"
                  : language === "kr"
                    ? "글로벌 기준값"
                    : "Global Reference",
              ];
            }}
            contentStyle={{
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
            }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#7c4a21"
            strokeWidth={3}
            dot={{ r: 4, fill: "#183a37" }}
            activeDot={{ r: 6 }}
          />
          {hasReferenceLine ? (
            <ReferenceLine
              y={referencePrice ?? undefined}
              stroke="#111111"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
