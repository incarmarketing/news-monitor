import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const fallbackColors = ["#2855d9", "#14805f", "#b45309", "#6d5bd0", "#64748b"];

export function HorizontalBarPrimitive({ rows = [], compact = false, color = "#2855d9", colors = fallbackColors, valueFormatter }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 18, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="name" type="category" width={compact ? 76 : 92} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 800 }} />
        <Tooltip formatter={(value) => valueFormatter ? valueFormatter(value) : value} />
        <Bar dataKey="value" radius={[0, 7, 7, 0]}>
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
          <Bar dataKey="value" radius={[7, 7, 0, 0]} maxBarSize={46}>
            <LabelList dataKey="value" position="top" formatter={(value) => `${Number(value || 0).toLocaleString("ko-KR")}건`} fill="#0f1f3d" fontSize={11} fontWeight={900} />
            {rows.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
          </Bar>
        </BarChart>
      ) : (
        <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 8 }}>
          <XAxis type="number" hide />
          <YAxis dataKey="name" type="category" width={labelWidth} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => [`${Number(value || 0).toLocaleString("ko-KR")}건`, "기사량"]} />
          <Bar dataKey="value" radius={[0, 7, 7, 0]}>
            {rows.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function ToneTrendPrimitive({ rows = [], compact = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ left: 8, right: 12, top: 12, bottom: 2 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={compact ? 8 : 14} tick={{ fontSize: compact ? 9 : 12, fontWeight: 800 }} />
        <YAxis hide />
        <Tooltip />
        <Line type="monotone" dataKey="positive" stroke="#14805f" strokeWidth={2.5} dot={false} name="긍정" />
        <Line type="monotone" dataKey="caution" stroke="#b45309" strokeWidth={2.5} dot={false} name="주의" />
        <Line type="monotone" dataKey="negative" stroke="#c92337" strokeWidth={2.5} dot={false} name="부정" />
      </LineChart>
    </ResponsiveContainer>
  );
}
