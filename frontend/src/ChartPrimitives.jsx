import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const fallbackColors = ["#7b901c", "#738d70", "#bd744d", "#787b7c", "#525953"];

export function HorizontalBarPrimitive({ rows = [], compact = false, color = "#7b901c", colors = fallbackColors, valueFormatter }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 18, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="name" type="category" width={compact ? 86 : 115} tickLine={false} axisLine={false} tick={{ fontSize: 14, fontWeight: 550 }} />
        <Tooltip formatter={(value) => valueFormatter ? valueFormatter(value) : value} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {rows.map((row, index) => <Cell key={row.name} fill={index === 0 ? color : colors[index % colors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarPrimitive({ rows = [], verticalBars = false, colors = fallbackColors, labelWidth = 86 }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      {verticalBars ? (
        <BarChart data={rows} margin={{ left: 4, right: 6, top: 26, bottom: 4 }} barCategoryGap={18}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11, fontWeight: 900 }} />
          <YAxis type="number" hide />
          <Tooltip formatter={(value) => [`${Number(value || 0).toLocaleString("ko-KR")}건`, "기사량"]} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={46} isAnimationActive={false}>
            <LabelList dataKey="value" position="top" formatter={(value) => `${Number(value || 0).toLocaleString("ko-KR")}건`} fill="#0f1f3d" fontSize={11} fontWeight={900} />
            {rows.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
          </Bar>
        </BarChart>
      ) : (
        <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 8 }}>
          <XAxis type="number" hide />
          <YAxis dataKey="name" type="category" width={labelWidth} tickLine={false} axisLine={false} tick={{ fontSize: 14, fill: "var(--ink)", fontWeight: 500 }} />
          <Tooltip formatter={(value) => [`${Number(value || 0).toLocaleString("ko-KR")}건`, "기사량"]} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {rows.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
