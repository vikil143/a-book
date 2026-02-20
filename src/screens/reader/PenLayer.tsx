import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Canvas,
  Path,
  Skia,
  usePathValue,
} from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import type { StrokePoint, StrokeRow, ToolKind } from "../readerTypes";
import { buildStrokeGeometry, parseStrokePoints } from "./inkUtils";

type LiveStroke = {
  points: StrokePoint[];
  color: string;
  width: number;
  tool: ToolKind;
};

type Props = {
  width: number;
  height: number;
  strokes: StrokeRow[];
  activeStroke: SharedValue<LiveStroke | null>;
  eraseMode: boolean;
  selectable: boolean;
  onPressStroke: (stroke: StrokeRow) => void;
};

type BuiltStroke = {
  stroke: StrokeRow;
  path: ReturnType<typeof Skia.Path.Make>;
  color: string;
  opacity: number;
  underline: boolean;
  strokeWidth: number;
  bounds: { left: number; top: number; width: number; height: number };
};

function toPx(point: StrokePoint, width: number, height: number) {
  "worklet";
  const xPct = typeof point.xPct === "number" ? point.xPct : point.x;
  const yPct = typeof point.yPct === "number" ? point.yPct : point.y;
  return {
    x: Math.max(0, Math.min(1, xPct)) * width,
    y: Math.max(0, Math.min(1, yPct)) * height,
  };
}

function PenLayerImpl({ width, height, strokes, activeStroke, eraseMode, selectable, onPressStroke }: Props) {
  const builtStrokes = useMemo(() => {
    if (!width || !height) return [] as BuiltStroke[];
    const mapped: BuiltStroke[] = [];
    for (const stroke of strokes) {
      const points = parseStrokePoints(stroke.points_json);
      const built = buildStrokeGeometry(points, width, height, {
        tool: stroke.tool,
        color: stroke.color,
        width: stroke.width,
      });
      if (!built) continue;
      mapped.push({
        stroke,
        path: built.path,
        color: built.color,
        opacity: built.opacity,
        underline: built.underline,
        strokeWidth: built.strokeWidth,
        bounds: built.bounds,
      });
    }
    return mapped;
  }, [height, strokes, width]);

  const activeInkPath = usePathValue((path) => {
    "worklet";
    path.reset();
    const live = activeStroke.value;
    if (!live || !width || !height || live.points.length < 2 || live.tool === "underline") return;
    const start = toPx(live.points[0], width, height);
    path.moveTo(start.x, start.y);
    for (let i = 1; i < live.points.length; i++) {
      const prev = toPx(live.points[i - 1], width, height);
      const cur = toPx(live.points[i], width, height);
      const midX = (prev.x + cur.x) * 0.5;
      const midY = (prev.y + cur.y) * 0.5;
      path.quadTo(prev.x, prev.y, midX, midY);
    }
    const end = toPx(live.points[live.points.length - 1], width, height);
    path.lineTo(end.x, end.y);
  }, Skia.Path.Make());

  const activeLinePath = usePathValue((path) => {
    "worklet";
    path.reset();
    const live = activeStroke.value;
    if (!live || !width || !height || live.points.length < 2 || live.tool !== "underline") return;
    const start = toPx(live.points[0], width, height);
    path.moveTo(start.x, start.y);
    for (let i = 1; i < live.points.length; i++) {
      const prev = toPx(live.points[i - 1], width, height);
      const cur = toPx(live.points[i], width, height);
      const midX = (prev.x + cur.x) * 0.5;
      const midY = (prev.y + cur.y) * 0.5;
      path.quadTo(prev.x, prev.y, midX, midY);
    }
    const end = toPx(live.points[live.points.length - 1], width, height);
    path.lineTo(end.x, end.y);
  }, Skia.Path.Make());

  const activeColor = useDerivedValue(() => activeStroke.value?.color ?? "#000000", [activeStroke]);
  const activeStrokeWidth = useDerivedValue(() => activeStroke.value?.width ?? 2, [activeStroke]);
  const activeOpacity = useDerivedValue(() => {
    const tool = activeStroke.value?.tool;
    if (tool === "marker") return 0.42;
    if (tool === "highlighter") return 0.24;
    return 1;
  }, [activeStroke]);

  if (!width || !height) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
        {builtStrokes.map((item, index) => (
          <Path
            key={`persisted-${index}`}
            path={item.path}
            color={item.color}
            opacity={item.opacity}
            style={item.underline ? "stroke" : "fill"}
            strokeWidth={item.underline ? item.strokeWidth : undefined}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}

        <Path
          path={activeInkPath}
          color={activeColor}
          opacity={activeOpacity}
          style="stroke"
          strokeWidth={activeStrokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />

        <Path
          path={activeLinePath}
          color={activeColor}
          opacity={activeOpacity}
          style="stroke"
          strokeWidth={activeStrokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />
      </Canvas>

      {builtStrokes.map((built) => (
        <Pressable
          key={built.stroke.id}
          onPress={() => onPressStroke(built.stroke)}
          pointerEvents={eraseMode || selectable ? "auto" : "none"}
          style={[styles.strokeHit, built.bounds]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strokeHit: {
    position: "absolute",
    backgroundColor: "transparent",
  },
});

export type { LiveStroke };
export default React.memo(PenLayerImpl);
