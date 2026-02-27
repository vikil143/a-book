import ReactNativeBlobUtil from "react-native-blob-util";
import RNFS from "react-native-fs";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { getBookExportMeta, getExportHighlightsForPage, getExportStrokesForPage } from "../db/exportAnnotations";
import { clamp, parseStrokePoints, pointToPx, sampleCatmullRom } from "../screens/reader/inkUtils";
import type { HighlightColor, StrokeRow, ToolKind } from "../screens/readerTypes";
import type { StrokePointPx } from "../screens/reader/inkUtils";

type ExportProgress = {
  pageNumber: number;
  totalPages: number;
  progressPct: number;
};

type ExportAnnotatedPdfArgs = {
  bookId: string;
  inputPdfPath: string;
  outputDir: string;
  referencePageSizePx?: {
    width: number;
    height: number;
  };
  onProgress?: (progress: ExportProgress) => void;
  shouldCancel?: () => boolean;
};

type ExportAnnotatedPdfResult = {
  outputPath: string;
};

type PdfColor = ReturnType<typeof rgb>;

const HIGHLIGHT_ALPHA: Record<HighlightColor, number> = {
  yellow: 0.42,
  green: 0.38,
  blue: 0.4,
  pink: 0.4,
};

const HIGHLIGHT_RGB: Record<HighlightColor, PdfColor> = {
  yellow: rgb(1, 0.89, 0.42),
  green: rgb(0.3, 0.84, 0.54),
  blue: rgb(0.35, 0.65, 1),
  pink: rgb(0.96, 0.48, 0.77),
};

const FALLBACK_HIGHLIGHT_COLOR: HighlightColor = "yellow";

function normalizePath(path: string) {
  return path.startsWith("file://") ? path.slice("file://".length) : path;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function buildTimestamp(date: Date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
}

function sanitizeFileStem(title: string) {
  const trimmed = title.trim().replace(/\s+/g, " ");
  const sanitized = trimmed.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-");
  return sanitized || "book";
}

function toPdfHighlightColor(color: string): HighlightColor {
  if (color === "green" || color === "blue" || color === "pink" || color === "yellow") return color;
  return FALLBACK_HIGHLIGHT_COLOR;
}

function parseHexColor(input: string): PdfColor {
  const value = input.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!match) return rgb(0.14, 0.43, 0.88);
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function getStrokeOpacity(tool: ToolKind) {
  if (tool === "marker") return 0.36;
  if (tool === "highlighter") return 0.24;
  return 1;
}

function toPdfStrokeWidth(stroke: StrokeRow, page: PDFPage, referencePageSizePx?: { width: number; height: number }) {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const refWidth = referencePageSizePx?.width ?? 0;
  const refHeight = referencePageSizePx?.height ?? 0;
  if (refWidth > 0 && refHeight > 0) {
    const scale = Math.min(refWidth / pageWidth, refHeight / pageHeight);
    if (scale > 0) return Math.max(0.75, stroke.width / scale);
  }
  if (refWidth > 0) return Math.max(0.75, (stroke.width / refWidth) * pageWidth);
  return Math.max(0.75, stroke.width);
}

function drawHighlight(page: PDFPage, highlight: { x: number; y: number; w: number; h: number; color: string }) {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const highlightColor = toPdfHighlightColor(highlight.color);
  const x = clamp(highlight.x, 0, 1) * pageWidth;
  const y = (1 - clamp(highlight.y, 0, 1) - clamp(highlight.h, 0, 1)) * pageHeight;
  const width = clamp(highlight.w, 0, 1) * pageWidth;
  const height = clamp(highlight.h, 0, 1) * pageHeight;
  if (width <= 0 || height <= 0) return;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: HIGHLIGHT_RGB[highlightColor],
    opacity: HIGHLIGHT_ALPHA[highlightColor],
  });
}

function buildPdfStrokePoints(pointsJson: string, pageWidth: number, pageHeight: number) {
  const rawPoints = parseStrokePoints(pointsJson);
  const pagePoints = rawPoints
    .map((point) => pointToPx(point, pageWidth, pageHeight))
    .filter((point): point is StrokePointPx => point != null)
    .map((point) => ({
      ...point,
      y: pageHeight - point.y,
    }));

  if (pagePoints.length < 2) return [];
  return sampleCatmullRom(pagePoints);
}

function drawStroke(page: PDFPage, stroke: StrokeRow, referencePageSizePx?: { width: number; height: number }) {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const points = buildPdfStrokePoints(stroke.points_json, pageWidth, pageHeight);
  if (points.length < 2) return;

  const opacity = getStrokeOpacity(stroke.tool);
  const thickness = toPdfStrokeWidth(stroke, page, referencePageSizePx);
  const color = parseHexColor(stroke.color);

  for (let index = 1; index < points.length; index += 1) {
    page.drawLine({
      start: { x: points[index - 1].x, y: points[index - 1].y },
      end: { x: points[index].x, y: points[index].y },
      thickness,
      color,
      opacity,
    });
  }
}

function shouldAbort(shouldCancel?: () => boolean) {
  return shouldCancel?.() === true;
}

function buildOutputPath(outputDir: string, title: string) {
  const fileName = `${sanitizeFileStem(title)}-annotated-${buildTimestamp(new Date())}.pdf`;
  return `${outputDir}/${fileName}`;
}

async function loadPdfBytes(inputPdfPath: string) {
  const base64 = await RNFS.readFile(inputPdfPath, "base64");
  const binaryString = ReactNativeBlobUtil.base64.decode(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index) & 0xff;
  }
  return bytes;
}

async function writePdfBytes(outputPath: string, bytes: Uint8Array) {
  await ReactNativeBlobUtil.fs.writeFile(outputPath, Array.from(bytes), "ascii");
}

export class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "ExportCancelledError";
  }
}

export class ExportPageError extends Error {
  pageNumber: number;

  constructor(pageNumber: number, cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause ?? "Unknown export error");
    super(`Export failed on page ${pageNumber}: ${detail}`);
    this.name = "ExportPageError";
    this.pageNumber = pageNumber;
  }
}

export async function exportAnnotatedPdf({
  bookId,
  inputPdfPath,
  outputDir,
  referencePageSizePx,
  onProgress,
  shouldCancel,
}: ExportAnnotatedPdfArgs): Promise<ExportAnnotatedPdfResult> {
  const normalizedInputPath = normalizePath(inputPdfPath);
  const book = await getBookExportMeta(bookId);
  if (!book) {
    throw new Error("Book metadata not found for export.");
  }
  if (!(await RNFS.exists(normalizedInputPath))) {
    throw new Error("Original PDF file is missing from local storage.");
  }

  await RNFS.mkdir(outputDir);
  const outputPath = buildOutputPath(outputDir, book.title);

  let wroteOutput = false;
  try {
    const pdfBytes = await loadPdfBytes(normalizedInputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      if (shouldAbort(shouldCancel)) {
        throw new ExportCancelledError();
      }

      const pageNumber = pageIndex + 1;
      const page = pages[pageIndex];

      try {
        const [highlights, strokes] = await Promise.all([
          getExportHighlightsForPage(bookId, pageNumber),
          getExportStrokesForPage(bookId, pageNumber),
        ]);

        highlights.forEach((highlight) => drawHighlight(page, highlight));
        strokes.forEach((stroke) => drawStroke(page, stroke, referencePageSizePx));
      } catch (error) {
        throw new ExportPageError(pageNumber, error);
      }

      onProgress?.({
        pageNumber,
        totalPages,
        progressPct: Math.round((pageNumber / Math.max(totalPages, 1)) * 100),
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (shouldAbort(shouldCancel)) {
      throw new ExportCancelledError();
    }

    const outputBytes = await pdfDoc.save();
    if (shouldAbort(shouldCancel)) {
      throw new ExportCancelledError();
    }

    await writePdfBytes(outputPath, outputBytes);
    wroteOutput = true;
    return { outputPath };
  } catch (error) {
    if (wroteOutput && (await RNFS.exists(outputPath))) {
      await RNFS.unlink(outputPath).catch(() => undefined);
    }
    throw error;
  }
}
