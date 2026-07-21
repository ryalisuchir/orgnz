import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { color, space, type } from '../lib/theme';

const CHART_HEIGHT = 140;

export function RateBarChart({
  data,
  labelKey,
  rateKey,
  totalKey,
  width = 320,
}: {
  data: Record<string, any>[];
  labelKey: string;
  rateKey: string;
  totalKey: string;
  width?: number;
}) {
  const barGap = 4;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;
  const maxBar = CHART_HEIGHT - 20;

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line x1={0} y1={CHART_HEIGHT - 20} x2={width} y2={CHART_HEIGHT - 20} stroke={color.line} strokeWidth={1} />
        {data.map((d, i) => {
          const hasData = d[totalKey] > 0;
          const h = hasData ? Math.max(4, d[rateKey] * maxBar) : 2;
          const x = i * (barWidth + barGap);
          const y = CHART_HEIGHT - 20 - h;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={3}
              fill={hasData ? color.accent : color.line}
              opacity={hasData ? 0.9 : 0.4}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', marginTop: space.xs }}>
        {data.map((d, i) => (
          <View key={i} style={{ width: barWidth + (i < data.length - 1 ? barGap : 0), alignItems: 'center' }}>
            <Text style={[type.caption, { fontSize: 10, color: color.inkFaint }]} numberOfLines={1}>
              {d[labelKey]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CategoryShareBar({
  slices,
  width = 320,
}: {
  slices: { label: string; count: number; color: string }[];
  width?: number;
}) {
  const total = slices.reduce((a, s) => a + s.count, 0) || 1;
  let cursor = 0;
  return (
    <View>
      <Svg width={width} height={22}>
        {slices.map((s, i) => {
          const w = (s.count / total) * width;
          const rect = (
            <Rect
              key={i}
              x={cursor}
              y={0}
              width={w}
              height={22}
              fill={s.color}
              rx={i === 0 ? 3 : 0}
            />
          );
          cursor += w;
          return rect;
        })}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm }}>
        {slices.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Text style={type.caption}>
              {s.label} ({s.count})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.display, { fontSize: 24, color: color.ink }]}>{value}</Text>
      <Text style={[type.label, { color: color.inkFaint }]}>{label.toUpperCase()}</Text>
      {sub ? <Text style={[type.caption, { marginTop: 2 }]}>{sub}</Text> : null}
    </View>
  );
}
