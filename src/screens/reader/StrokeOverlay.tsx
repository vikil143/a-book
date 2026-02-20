import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { StrokePoint, StrokeRow } from "../readerTypes";

type Props = {
  width: number;
  height: number;
  strokes: StrokeRow[];
  previewStroke: { points: StrokePoint[]; color: string; width: number; tool: "pen" | "marker" } | null;
  eraseMode: boolean;
  selectable: boolean;
  onPressStroke: (stroke: StrokeRow) => void;
};

type Segment = {
  key: string;
  left: number;
  top: number;
  length: number;
  angle: string;
  thickness: number;
  color: string;
  opacity: number;
};

type BuiltStroke = {
  stroke: StrokeRow;
  segments: Segment[];
  bounds: { left: number; top: number; width: number; height: number };
};

function safeParsePoints(pointsJson: string): StrokePoint[] {
  try {
    const parsed = JSON.parse(pointsJson) as StrokePoint[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => typeof p?.x === "number" && typeof p?.y === "number");
  } catch {
    return [];
  }
}

function buildSegments(points: StrokePoint[], width: number, height: number, color: string, strokeWidth: number, marker: boolean, keyPrefix: string) {
  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const x0 = p0.x * width;
    const y0 = p0.y * height;
    const x1 = p1.x * width;
    const y1 = p1.y * height;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.4) continue;
    const angle = `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`;
    segments.push({
      key: `${keyPrefix}-${i}`,
      left: x0,
      top: y0,
      length,
      angle,
      thickness: Math.max(1, strokeWidth),
      color,
      opacity: marker ? 0.35 : 0.9,
    });
  }
  return segments;
}

function buildBounds(points: StrokePoint[], width: number, height: number, lineWidth: number) {
  if (!points.length) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    const x = point.x * width;
    const y = point.y * height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  const padding = Math.max(12, lineWidth * 1.3);
  return {
    left: minX - padding,
    top: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}

function StrokeOverlayImpl({ width, height, strokes, previewStroke, eraseMode, selectable, onPressStroke }: Props) {
  const built = useMemo(() => {
    const mapped: BuiltStroke[] = [];
    strokes.forEach((stroke) => {
      const points = safeParsePoints(stroke.points_json);
      if (points.length < 2) return;
      mapped.push({
        stroke,
        segments: buildSegments(points, width, height, stroke.color, stroke.width, stroke.tool === "marker", stroke.id),
        bounds: buildBounds(points, width, height, stroke.width),
      });
    });
    return mapped;
  }, [height, strokes, width]);

  const previewSegments = useMemo(() => {
    if (!previewStroke) return [];
    return buildSegments(
      previewStroke.points,
      width,
      height,
      previewStroke.color,
      previewStroke.width,
      previewStroke.tool === "marker",
      "preview"
    );
  }, [height, previewStroke, width]);

  if (!width || !height) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {built.map(({ stroke, segments, bounds }) => {
        return (
          <View key={stroke.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {segments.map((segment) => (
              <View
                key={segment.key}
                pointerEvents="none"
                style={[
                  styles.segment,
                  {
                    left: segment.left,
                    top: segment.top,
                    width: segment.length,
                    height: segment.thickness,
                    borderRadius: segment.thickness,
                    backgroundColor: segment.color,
                    opacity: segment.opacity,
                    transform: [{ rotate: segment.angle }],
                  },
                ]}
              />
            ))}
            <Pressable
              onPress={() => onPressStroke(stroke)}
              pointerEvents={eraseMode || selectable ? "auto" : "none"}
              style={[styles.strokeHit, bounds]}
            />
          </View>
        );
      })}

      {previewSegments.map((segment) => (
        <View
          key={segment.key}
          pointerEvents="none"
          style={[
            styles.segment,
            {
              left: segment.left,
              top: segment.top,
              width: segment.length,
              height: segment.thickness,
              borderRadius: segment.thickness,
              backgroundColor: segment.color,
              opacity: segment.opacity,
              transform: [{ rotate: segment.angle }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    position: "absolute",
  },
  strokeHit: {
    position: "absolute",
    backgroundColor: "transparent",
  },
});

export default React.memo(StrokeOverlayImpl);
