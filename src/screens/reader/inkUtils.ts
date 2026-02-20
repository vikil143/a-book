import { Skia, type SkPath } from "@shopify/react-native-skia";
import type { StrokePoint, ToolKind } from "../readerTypes";

export type StrokePointPx = {
  x: number;
  y: number;
  t: number;
  v: number;
  w: number;
  force?: number;
};

export type WidthSimulationInput = {
  tool: ToolKind;
  baseWidth: number;
  velocity: number;
  previousWidth: number;
  force?: number;
};

export type BuiltStrokeGeometry = {
  path: SkPath;
  bounds: { left: number; top: number; width: number; height: number };
  color: string;
  opacity: number;
  tool: ToolKind;
  strokeWidth: number;
  underline: boolean;
};

export function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number) {
  "worklet";
  return a + (b - a) * t;
}

export function ema(previous: number, next: number, alpha: number) {
  "worklet";
  return previous + alpha * (next - previous);
}

export function distancePx(a: { x: number; y: number }, b: { x: number; y: number }) {
  "worklet";
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function widthRange(tool: ToolKind, baseWidth: number) {
  "worklet";
  if (tool === "marker") {
    return { min: clamp(baseWidth * 0.62, 3.2, 14), max: clamp(baseWidth * 1.34, 5.5, 24) };
  }
  if (tool === "highlighter") {
    return { min: clamp(baseWidth * 0.8, 5.5, 18), max: clamp(baseWidth * 1.28, 8, 30) };
  }
  if (tool === "underline") {
    return { min: baseWidth, max: baseWidth };
  }
  return { min: clamp(baseWidth * 0.45, 1.5, 6), max: clamp(baseWidth * 1.45, 2.2, 12) };
}

export function velocityToWidth(tool: ToolKind, baseWidth: number, velocity: number) {
  "worklet";
  const { min, max } = widthRange(tool, baseWidth);
  if (tool === "underline") return baseWidth;
  const velocityMin = 20;
  const velocityMax = tool === "pen" ? 2200 : 2600;
  const normalized = clamp((velocity - velocityMin) / (velocityMax - velocityMin), 0, 1);
  return max - (max - min) * normalized;
}

export function simulatePressureWidth(input: WidthSimulationInput) {
  "worklet";
  const { tool, baseWidth, velocity, previousWidth, force } = input;
  const { min, max } = widthRange(tool, baseWidth);
  if (tool === "underline") return baseWidth;

  const velocityWidth = velocityToWidth(tool, baseWidth, velocity);
  const normalizedForce = typeof force === "number" ? clamp(force, 0, 1) : null;
  const nativeWidth = normalizedForce == null ? velocityWidth : lerp(min, max, normalizedForce);
  const blendedTarget = normalizedForce == null ? velocityWidth : lerp(velocityWidth, nativeWidth, 0.34);
  const alpha = tool === "pen" ? 0.28 : tool === "marker" ? 0.2 : 0.16;
  return clamp(ema(previousWidth, blendedTarget, alpha), min, max);
}

export function toPercentPoint(point: StrokePointPx, width: number, height: number): StrokePoint {
  const xPct = clamp(point.x / width, 0, 1);
  const yPct = clamp(point.y / height, 0, 1);
  return {
    x: xPct,
    y: yPct,
    xPct,
    yPct,
    w: point.w,
    v: point.v,
    t: point.t,
    force: point.force,
  };
}

export function pointToPx(point: StrokePoint, width: number, height: number): StrokePointPx | null {
  const xPct = typeof point.xPct === "number" ? point.xPct : point.x;
  const yPct = typeof point.yPct === "number" ? point.yPct : point.y;
  if (typeof xPct !== "number" || typeof yPct !== "number") return null;
  return {
    x: clamp(xPct, 0, 1) * width,
    y: clamp(yPct, 0, 1) * height,
    t: Number(point.t) || 0,
    v: Number(point.v) || 0,
    w: Number(point.w) || 0,
    force: typeof point.force === "number" ? point.force : undefined,
  };
}

export function parseStrokePoints(pointsJson: string): StrokePoint[] {
  try {
    const parsed = JSON.parse(pointsJson) as StrokePoint[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((point) => {
      const xPct = typeof point?.xPct === "number" ? point.xPct : point?.x;
      const yPct = typeof point?.yPct === "number" ? point.yPct : point?.y;
      return typeof xPct === "number" && typeof yPct === "number";
    });
  } catch {
    return [];
  }
}

function interpolateCatmullRomPoint(
  p0: StrokePointPx,
  p1: StrokePointPx,
  p2: StrokePointPx,
  p3: StrokePointPx,
  t: number
) {
  const tt = t * t;
  const ttt = tt * t;
  const x =
    0.5 *
    ((2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt);
  const y =
    0.5 *
    ((2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt);
  return {
    x,
    y,
    w: lerp(p1.w, p2.w, t),
    v: lerp(p1.v, p2.v, t),
  };
}

export function sampleCatmullRom(points: StrokePointPx[]) {
  if (points.length < 3) return points;
  const sampled: StrokePointPx[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? points[0] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : points[points.length - 1];
    const segmentLength = Math.max(1, distancePx(p1, p2));
    const steps = clamp(Math.ceil(segmentLength / 2.4), 4, 24);
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const interpolated = interpolateCatmullRomPoint(p0, p1, p2, p3, t);
      sampled.push({
        x: interpolated.x,
        y: interpolated.y,
        w: interpolated.w,
        v: interpolated.v,
        t: 0,
      });
    }
  }

  return sampled;
}

function strokeOpacity(tool: ToolKind) {
  if (tool === "marker") return 0.42;
  if (tool === "highlighter") return 0.24;
  return 1;
}

function buildBounds(points: StrokePointPx[], padding: number) {
  if (!points.length) return { left: 0, top: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    left: minX - padding,
    top: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}

export function buildStrokeGeometry(
  pointsPercent: StrokePoint[],
  width: number,
  height: number,
  style: { tool: ToolKind; color: string; width: number }
): BuiltStrokeGeometry | null {
  const points = pointsPercent.map((point) => pointToPx(point, width, height)).filter(Boolean) as StrokePointPx[];
  if (points.length < 2) return null;

  const opacity = strokeOpacity(style.tool);
  if (style.tool === "underline") {
    const path = Skia.Path.Make();
    path.moveTo(points[0].x, points[0].y);
    const sampled = sampleCatmullRom(
      points.map((point) => ({
        ...point,
        w: point.w || style.width,
      }))
    );
    for (let i = 1; i < sampled.length; i++) {
      path.lineTo(sampled[i].x, sampled[i].y);
    }
    return {
      path,
      bounds: buildBounds(points, Math.max(10, style.width * 1.8)),
      color: style.color,
      opacity,
      tool: style.tool,
      strokeWidth: style.width,
      underline: true,
    };
  }

  const sampled = sampleCatmullRom(
    points.map((point) => ({
      ...point,
      w: point.w || velocityToWidth(style.tool, style.width, point.v || 0),
    }))
  );

  const path = Skia.Path.Make();
  let previous = sampled[0];
  let carry = 0;
  const firstRadius = Math.max(0.8, (sampled[0].w || style.width) / 2);
  path.addCircle(sampled[0].x, sampled[0].y, firstRadius);

  for (let i = 1; i < sampled.length; i++) {
    const point = sampled[i];
    const radius = Math.max(0.8, (point.w || style.width) / 2);
    const spacing = clamp(radius * 0.52, 0.9, 3.4);
    carry += distancePx(previous, point);
    if (carry < spacing) continue;
    carry = 0;
    path.addCircle(point.x, point.y, radius);
    previous = point;
  }

  const maxWidth = sampled.reduce((acc, point) => Math.max(acc, point.w || style.width), style.width);
  return {
    path,
    bounds: buildBounds(sampled, Math.max(12, maxWidth * 1.6)),
    color: style.color,
    opacity,
    tool: style.tool,
    strokeWidth: maxWidth,
    underline: false,
  };
}
