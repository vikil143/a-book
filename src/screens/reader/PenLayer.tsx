import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { StrokePoint, StrokeRow, ToolKind } from "../readerTypes";

type LiveStroke = {
  version: number;
  points: StrokePoint[];
  color: string;
  width: number;
  tool: ToolKind;
};

type Props = {
  width: number;
  height: number;
  strokes: StrokeRow[];
  activeStroke: LiveStroke | null;
  eraseMode: boolean;
  selectable: boolean;
  onPressStroke: (stroke: StrokeRow) => void;
};

type PointPx = {
  x: number;
  y: number;
  v: number;
};

type Stamp = {
  key: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
};

type BuiltStroke = {
  stroke: StrokeRow;
  stamps: Stamp[];
  line: null | { x: number; y: number; length: number; angle: string; thickness: number; opacity: number };
  color: string;
  marker: boolean;
  bounds: { left: number; top: number; width: number; height: number };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeParsePoints(pointsJson: string): StrokePoint[] {
  try {
    const parsed = JSON.parse(pointsJson) as StrokePoint[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => typeof p?.x === "number" && typeof p?.y === "number");
  } catch {
    return [];
  }
}

function toPxPoints(points: StrokePoint[], width: number, height: number): PointPx[] {
  return points.map((point) => ({
    x: point.x * width,
    y: point.y * height,
    v: Number(point.v) || 0,
  }));
}

function distance(a: PointPx, b: PointPx) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function interpolateCatmullRom(p0: PointPx, p1: PointPx, p2: PointPx, p3: PointPx, t: number): PointPx {
  const tt = t * t;
  const ttt = tt * t;
  const x =
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt);
  const y =
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt);
  const v = p1.v + (p2.v - p1.v) * t;
  return { x, y, v };
}

function sampleSpline(points: PointPx[]): PointPx[] {
  if (points.length <= 2) return points;
  const sampled: PointPx[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? points[0] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : points[points.length - 1];

    const segmentLength = Math.max(1, distance(p1, p2));
    const steps = clamp(Math.ceil(segmentLength / 2.4), 4, 28);
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      sampled.push(interpolateCatmullRom(p0, p1, p2, p3, t));
    }
  }

  return sampled;
}

function computeDynamicWidth(baseWidth: number, velocity: number, tool: ToolKind) {
  if (tool === "underline") return baseWidth;
  const normalized = clamp(velocity / 1800, 0, 1);
  if (tool === "marker") {
    const min = Math.max(2, baseWidth * 0.82);
    const max = baseWidth * 1.08;
    return max - (max - min) * normalized;
  }
  const min = Math.max(1.2, baseWidth * 0.66);
  const max = baseWidth * 1.16;
  return max - (max - min) * normalized;
}

function buildBounds(points: PointPx[], lineWidth: number) {
  if (!points.length) return { left: 0, top: 0, width: 0, height: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });

  const padding = Math.max(12, lineWidth * 1.4);
  return {
    left: minX - padding,
    top: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}

function buildUnderline(points: PointPx[], strokeWidth: number) {
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return null;
  return {
    x: start.x,
    y: start.y,
    length,
    angle: `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`,
    thickness: Math.max(1.4, strokeWidth),
    opacity: 0.9,
  };
}

function buildStamps(points: PointPx[], strokeWidth: number, tool: ToolKind, keyPrefix: string): Stamp[] {
  if (points.length < 2) return [];
  const sampled = sampleSpline(points);
  const stamps: Stamp[] = [];

  let lastStamp = sampled[0];
  let carry = 0;

  for (let i = 0; i < sampled.length; i++) {
    const point = sampled[i];
    const dynamicWidth = computeDynamicWidth(strokeWidth, point.v, tool);
    const spacing = clamp(dynamicWidth * 0.28, 0.9, 3.6);
    const opacity = tool === "marker" ? clamp(0.23 + dynamicWidth / 90, 0.2, 0.36) : clamp(0.86 + dynamicWidth / 40, 0.84, 0.98);

    if (i === 0) {
      stamps.push({
        key: `${keyPrefix}-0`,
        x: point.x,
        y: point.y,
        size: dynamicWidth,
        opacity,
      });
      continue;
    }

    const stepDistance = distance(lastStamp, point);
    carry += stepDistance;
    if (carry < spacing) continue;
    carry = 0;
    lastStamp = point;

    stamps.push({
      key: `${keyPrefix}-${i}`,
      x: point.x,
      y: point.y,
      size: dynamicWidth,
      opacity,
    });
  }

  return stamps;
}

function buildStroke(pointsPercent: StrokePoint[], width: number, height: number, stroke: Pick<StrokeRow, "id" | "tool" | "color" | "width">): BuiltStroke | null {
  const pxPoints = toPxPoints(pointsPercent, width, height);
  if (pxPoints.length < 2) return null;
  const line = stroke.tool === "underline" ? buildUnderline(pxPoints, stroke.width) : null;
  const stamps = stroke.tool === "underline" ? [] : buildStamps(pxPoints, stroke.width, stroke.tool, stroke.id);
  return {
    stroke: stroke as StrokeRow,
    stamps,
    line,
    color: stroke.color,
    marker: stroke.tool === "marker",
    bounds: buildBounds(pxPoints, stroke.width),
  };
}

const PersistedStroke = React.memo(function PersistedStroke({
  built,
  enabled,
  onPress,
}: {
  built: BuiltStroke;
  enabled: boolean;
  onPress: (stroke: StrokeRow) => void;
}) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {built.line ? (
        <View
          pointerEvents="none"
          style={[
            styles.segment,
            {
              left: built.line.x,
              top: built.line.y - built.line.thickness / 2,
              width: built.line.length,
              height: built.line.thickness,
              borderRadius: built.line.thickness / 2,
              backgroundColor: built.color,
              opacity: built.line.opacity,
              transform: [{ rotate: built.line.angle }],
            },
          ]}
        />
      ) : (
        built.stamps.map((stamp) => (
          <View
            key={stamp.key}
            pointerEvents="none"
            style={[
              styles.stamp,
              {
                left: stamp.x - stamp.size / 2,
                top: stamp.y - stamp.size / 2,
                width: stamp.size,
                height: stamp.size,
                borderRadius: stamp.size / 2,
                backgroundColor: built.color,
                opacity: stamp.opacity,
              },
              built.marker
                ? styles.markerStamp
                : null,
            ]}
          />
        ))
      )}
      <Pressable onPress={() => onPress(built.stroke)} pointerEvents={enabled ? "auto" : "none"} style={[styles.strokeHit, built.bounds]} />
    </View>
  );
});

function ActiveStrokePreview({
  width,
  height,
  activeStroke,
}: {
  width: number;
  height: number;
  activeStroke: LiveStroke | null;
}) {
  const [snapshot, setSnapshot] = useState<LiveStroke | null>(activeStroke);
  const onSnapshot = useCallback((next: LiveStroke | null) => setSnapshot(next), []);

  React.useEffect(() => {
    onSnapshot(activeStroke ? { ...activeStroke, points: activeStroke.points.slice() } : null);
  }, [activeStroke, onSnapshot]);

  const built = useMemo(() => {
    if (!snapshot || !width || !height || snapshot.points.length < 2) return null;
    return buildStroke(snapshot.points, width, height, {
      id: "active",
      tool: snapshot.tool,
      color: snapshot.color,
      width: snapshot.width,
    });
  }, [height, snapshot, width]);

  if (!built) return null;
  if (built.line) {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.segment,
          {
            left: built.line.x,
            top: built.line.y - built.line.thickness / 2,
            width: built.line.length,
            height: built.line.thickness,
            borderRadius: built.line.thickness / 2,
            backgroundColor: built.color,
            opacity: built.line.opacity,
            transform: [{ rotate: built.line.angle }],
          },
        ]}
      />
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {built.stamps.map((stamp) => (
        <View
          key={stamp.key}
          style={[
            styles.stamp,
            {
              left: stamp.x - stamp.size / 2,
              top: stamp.y - stamp.size / 2,
              width: stamp.size,
              height: stamp.size,
              borderRadius: stamp.size / 2,
              backgroundColor: built.color,
              opacity: stamp.opacity,
            },
            built.marker
              ? styles.markerStamp
              : null,
          ]}
        />
      ))}
    </View>
  );
}

function PenLayerImpl({ width, height, strokes, activeStroke, eraseMode, selectable, onPressStroke }: Props) {
  const builtStrokes = useMemo(() => {
    if (!width || !height) return [];
    const mapped: BuiltStroke[] = [];
    strokes.forEach((stroke) => {
      const points = safeParsePoints(stroke.points_json);
      const built = buildStroke(points, width, height, stroke);
      if (built) mapped.push(built);
    });
    return mapped;
  }, [height, strokes, width]);

  if (!width || !height) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {builtStrokes.map((built) => (
        <PersistedStroke key={built.stroke.id} built={built} enabled={eraseMode || selectable} onPress={onPressStroke} />
      ))}
      <ActiveStrokePreview width={width} height={height} activeStroke={activeStroke} />
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    position: "absolute",
  },
  stamp: {
    position: "absolute",
  },
  markerStamp: {
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    elevation: 1,
  },
  strokeHit: {
    position: "absolute",
    backgroundColor: "transparent",
  },
});

export type { LiveStroke };
export default React.memo(PenLayerImpl);
