import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { getDB } from "../db";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { uid } from "../utils/files";
import PremiumHeader from "../components/PremiumHeader";
import NotesBottomSheet, { type ReaderNote } from "../components/NotesBottomSheet";
import TopicsDrawer, { type ReaderTopic } from "../components/TopicsDrawer";
import HighlightMiniToolbar, { type HighlightColor } from "../components/HighlightMiniToolbar";
import MarksRail from "../components/MarksRail";
import PageNavigationBar from "../components/PageNavigationBar";
import FloatingToolBar from "../components/FloatingToolBar";
import { getBookMarksSummary, type PageMarksSummary } from "../db/marksSummary";
import RNFS from "react-native-fs";
import OverlayRoot from "./reader/OverlayRoot";
import { type LiveStroke } from "./reader/PenLayer";
import type { HighlightRow, StrokePoint, StrokeRow, ToolKind } from "./readerTypes";
import { ExportCancelledError, ExportPageError, exportAnnotatedPdf } from "../utils/exportAnnotatedPdf";
import {
  clamp,
  distancePx,
  simulatePressureWidth,
  toPercentPoint,
  velocityToWidth,
  type StrokePointPx,
} from "./reader/inkUtils";
import SinglePagePdfView from "./reader/SinglePagePdfView";

type Props = NativeStackScreenProps<RootStackParamList, "Reader">;

type BookRow = { id: string; title: string; local_path: string };

type RectPx = { x: number; y: number; w: number; h: number };
type PointPx = { x: number; y: number };
type DraftStrokePoint = StrokePointPx;

type TopicEditorState = {
  visible: boolean;
  mode: "add" | "rename";
  topicId: string | null;
  name: string;
  color: string;
};

type ExportState = {
  visible: boolean;
  status: "idle" | "running" | "success" | "error";
  progressPct: number;
  pageNumber: number;
  totalPages: number;
  outputPath: string | null;
  errorMessage: string | null;
};

type PageAnnotationsCacheEntry = {
  highlights: HighlightRow[];
  strokes: StrokeRow[];
};

type Mode = "none" | "highlight" | "pen" | "marker" | "highlighter" | "underline" | "eraser" | "stroke_select";

const MIN_RECT_SIZE_PX = 8;
const MIN_STROKE_POINTS = 2;
const EXPORTS_DIR = `${RNFS.DocumentDirectoryPath}/exports`;

const TOPIC_PRESET: Array<{ name: string; color: string }> = [
  { name: "Important", color: "#ffd84f" },
  { name: "Definition", color: "#4dd589" },
  { name: "Concept", color: "#5aa7ff" },
  { name: "Doubt", color: "#f67bc4" },
];

const COLOR_TO_KIND: Record<HighlightColor, "normal" | "important" | "doubt"> = {
  yellow: "important",
  green: "normal",
  blue: "normal",
  pink: "doubt",
};

const COLOR_LABELS: Record<HighlightColor, string> = {
  yellow: "Important",
  green: "Definition",
  blue: "Concept",
  pink: "Doubt",
};

const HIGHLIGHT_LEGEND_BORDER: Record<HighlightColor, string> = {
  yellow: "#e6c447",
  green: "#43b874",
  blue: "#4a8fdf",
  pink: "#dd69af",
};

function normalizeRectPx(startX: number, startY: number, endX: number, endY: number, width: number, height: number): RectPx {
  const sx = clamp(startX, 0, width);
  const sy = clamp(startY, 0, height);
  const ex = clamp(endX, 0, width);
  const ey = clamp(endY, 0, height);
  return {
    x: Math.min(sx, ex),
    y: Math.min(sy, ey),
    w: Math.abs(ex - sx),
    h: Math.abs(ey - sy),
  };
}

function toHighlightColor(value: string): HighlightColor {
  if (value === "green" || value === "blue" || value === "pink") return value;
  return "yellow";
}

function toOptionalHighlightColor(value?: string | null): HighlightColor | null {
  if (value === "green" || value === "blue" || value === "pink" || value === "yellow") return value;
  return null;
}

function getStrokeStyle(mode: Mode, toolStyles: Record<ToolKind, { width: number; color: string }>) {
  if (mode === "marker") {
    return { tool: "marker" as ToolKind, ...toolStyles.marker };
  }
  if (mode === "highlighter") {
    return { tool: "highlighter" as ToolKind, ...toolStyles.highlighter };
  }
  if (mode === "underline") {
    return { tool: "underline" as ToolKind, ...toolStyles.underline };
  }
  return { tool: "pen" as ToolKind, ...toolStyles.pen };
}

export default function ReaderScreen({ route, navigation }: Props) {
  const { bookId } = route.params;

  const pdfRef = useRef<any>(null);
  const pageRef = useRef(1);
  const drawStartRef = useRef<PointPx | null>(null);
  const strokeDraftRef = useRef<DraftStrokePoint[]>([]);
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportCancelRef = useRef(false);
  const annotationCacheRef = useRef<Map<number, PageAnnotationsCacheEntry>>(new Map());
  const activeStrokeSv = useSharedValue<LiveStroke | null>(null);
  const railCurrentPageSv = useSharedValue(1);
  const previewRectXSv = useSharedValue(0);
  const previewRectYSv = useSharedValue(0);
  const previewRectWSv = useSharedValue(0);
  const previewRectHSv = useSharedValue(0);
  const previewRectVisibleSv = useSharedValue(0);

  const [book, setBook] = useState<BookRow | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const [mode, setMode] = useState<Mode>("none");
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionImportantOnly, setRevisionImportantOnly] = useState(true);

  const [notesVisible, setNotesVisible] = useState(false);
  const [topicsVisible, setTopicsVisible] = useState(false);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);

  const [notes, setNotes] = useState<ReaderNote[]>([]);
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [strokes, setStrokes] = useState<StrokeRow[]>([]);
  const [topics, setTopics] = useState<ReaderTopic[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [marksSummary, setMarksSummary] = useState<PageMarksSummary[]>([]);

  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [activeGlowHighlightId, setActiveGlowHighlightId] = useState<string | null>(null);

  const [miniToolbar, setMiniToolbar] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false,
    x: 0,
    y: 0,
  });

  const [highlightSheetVisible, setHighlightSheetVisible] = useState(false);
  const [strokeSheetVisible, setStrokeSheetVisible] = useState(false);
  const [linkedNoteId, setLinkedNoteId] = useState<string | null>(null);
  const [linkedNoteText, setLinkedNoteText] = useState("");
  const [highlightNoteEditorVisible, setHighlightNoteEditorVisible] = useState(false);

  const [pendingJumpHighlightId, setPendingJumpHighlightId] = useState<string | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const [topicEditor, setTopicEditor] = useState<TopicEditorState>({
    visible: false,
    mode: "add",
    topicId: null,
    name: "",
    color: TOPIC_PRESET[0].color,
  });
  const [exportState, setExportState] = useState<ExportState>({
    visible: false,
    status: "idle",
    progressPct: 0,
    pageNumber: 0,
    totalPages: 0,
    outputPath: null,
    errorMessage: null,
  });
  const [toolStyles, setToolStyles] = useState<Record<ToolKind, { width: number; color: string }>>({
    pen: { width: 3, color: "#246de0" },
    marker: { width: 12, color: "#ffd84f" },
    highlighter: { width: 16, color: "#ffe56a" },
    underline: { width: 4, color: "#246de0" },
  });

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const source = useMemo(() => {
    if (!book) return null;
    const uri = book.local_path.startsWith("file://") ? book.local_path : `file://${book.local_path}`;
    return { uri };
  }, [book]);

  const onPdfError = useCallback((e: unknown) => {
    console.log("PDF error:", e);
    Alert.alert("PDF Error", "Could not open this PDF on device.");
  }, []);

  const onStageLayoutSize = useCallback((size: { width: number; height: number }) => {
    setContainerSize((prev) => {
      if (prev.width === size.width && prev.height === size.height) return prev;
      return size;
    });
  }, []);

  const highlightMode = mode === "highlight";
  const penMode =
    mode === "pen" || mode === "marker" || mode === "highlighter" || mode === "underline" || mode === "eraser" || mode === "stroke_select";
  const drawEnabled = mode === "highlight" || mode === "pen" || mode === "marker" || mode === "highlighter" || mode === "underline";
  const eraseMode = mode === "eraser";
  const strokeSelectMode = mode === "stroke_select";
  const overlayCaptureEnabled = drawEnabled || eraseMode || strokeSelectMode;

  const selectedHighlight = useMemo(
    () => highlights.find((item) => item.id === selectedHighlightId) ?? null,
    [highlights, selectedHighlightId]
  );

  const selectedStroke = useMemo(
    () => strokes.find((item) => item.id === selectedStrokeId) ?? null,
    [selectedStrokeId, strokes]
  );

  const visibleTopicMap = useMemo(() => {
    const map = new Map<string, boolean>();
    topics.forEach((topic) => map.set(topic.id, topic.is_visible === 1));
    return map;
  }, [topics]);

  const visibleHighlights = useMemo(() => {
    return highlights.filter((item) => {
      if (item.topic_id && visibleTopicMap.has(item.topic_id) && !visibleTopicMap.get(item.topic_id)) return false;
      if (revisionMode && revisionImportantOnly && item.color !== "yellow") return false;
      return true;
    });
  }, [highlights, revisionImportantOnly, revisionMode, visibleTopicMap]);

  const visibleStrokes = useMemo(() => {
    return strokes.filter((item) => {
      if (item.topic_id && visibleTopicMap.has(item.topic_id) && !visibleTopicMap.get(item.topic_id)) return false;
      return true;
    });
  }, [strokes, visibleTopicMap]);

  const currentPageNotes = useMemo(() => notes.filter((item) => item.page_number === page), [notes, page]);

  const topicsWithPageStats = useMemo(() => {
    const pageCounts = new Map<string, number>();
    visibleHighlights.forEach((item) => {
      if (!item.topic_id) return;
      pageCounts.set(item.topic_id, (pageCounts.get(item.topic_id) ?? 0) + 1);
    });
    visibleStrokes.forEach((item) => {
      if (!item.topic_id) return;
      pageCounts.set(item.topic_id, (pageCounts.get(item.topic_id) ?? 0) + 1);
    });
    currentPageNotes.forEach((item) => {
      if (!item.topic_id) return;
      pageCounts.set(item.topic_id, (pageCounts.get(item.topic_id) ?? 0) + 1);
    });
    return topics.map((topic) => ({
      ...topic,
      pageAnnotationCount: pageCounts.get(topic.id) ?? 0,
    }));
  }, [currentPageNotes, topics, visibleHighlights, visibleStrokes]);

  const isBookmarked = useMemo(() => bookmarks.includes(page), [bookmarks, page]);

  const currentPageTopicCount = useMemo(
    () => topicsWithPageStats.filter((topic) => (topic.pageAnnotationCount ?? 0) > 0).length,
    [topicsWithPageStats]
  );

  const currentPageMarks = useMemo(
    () => visibleHighlights.length + visibleStrokes.length + (isBookmarked ? 1 : 0),
    [isBookmarked, visibleHighlights.length, visibleStrokes.length]
  );

  const previewRectAnimatedStyle = useAnimatedStyle(() => ({
    opacity: previewRectVisibleSv.value,
    transform: [{ translateX: previewRectXSv.value }, { translateY: previewRectYSv.value }],
    width: previewRectWSv.value,
    height: previewRectHSv.value,
  }));

  const resetToolbarTimer = useCallback((ms = 3200) => {
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = setTimeout(() => {
      setMiniToolbar({ visible: false, x: 0, y: 0 });
    }, ms);
  }, []);

  const flashHighlight = useCallback((highlightId: string) => {
    setActiveGlowHighlightId(highlightId);
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    glowTimerRef.current = setTimeout(() => setActiveGlowHighlightId(null), 1500);
  }, []);

  const showMiniToolbarAt = useCallback(
    (x: number, y: number) => {
      setMiniToolbar({ visible: true, x, y });
      resetToolbarTimer();
    },
    [resetToolbarTimer]
  );

  const loadBook = useCallback(async () => {
    const db = await getDB();
    const result = await db.executeSql("SELECT id, title, local_path FROM books WHERE id = ?", [bookId]);
    const row = result[0].rows.length ? (result[0].rows.item(0) as BookRow) : null;
    setBook(row);
  }, [bookId]);

  const ensureDefaultTopics = useCallback(async () => {
    const db = await getDB();
    const now = Date.now();
    for (const topic of TOPIC_PRESET) {
      const existsResult = await db.executeSql(
        "SELECT id FROM topics WHERE book_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
        [bookId, topic.name]
      );
      if (existsResult[0].rows.length) continue;
      await db.executeSql(
        "INSERT INTO topics (id, book_id, name, color, is_visible, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
        [uid(), bookId, topic.name, topic.color, now, now]
      );
    }
  }, [bookId]);

  const loadTopics = useCallback(async () => {
    const db = await getDB();
    const result = await db.executeSql(
      `SELECT t.id, t.name, t.color, t.is_visible,
          COALESCE(h.cnt, 0) + COALESCE(s.cnt, 0) AS annotationCount
        FROM topics t
        LEFT JOIN (
          SELECT topic_id, COUNT(*) AS cnt
          FROM highlights
          WHERE book_id = ?
          GROUP BY topic_id
        ) h ON h.topic_id = t.id
        LEFT JOIN (
          SELECT topic_id, COUNT(*) AS cnt
          FROM strokes
          WHERE book_id = ?
          GROUP BY topic_id
        ) s ON s.topic_id = t.id
        WHERE t.book_id = ?
        ORDER BY t.created_at ASC`,
      [bookId, bookId, bookId]
    );

    if (!result[0].rows.length) {
      await ensureDefaultTopics();
      return loadTopics();
    }

    const next: ReaderTopic[] = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      const row = result[0].rows.item(i) as ReaderTopic & { annotationCount: number };
      next.push({ ...row, annotationCount: Number(row.annotationCount) || 0 });
    }

    setTopics(next);
    setActiveTopicId((prev) => (prev && next.some((item) => item.id === prev) ? prev : next[0]?.id ?? null));
  }, [bookId, ensureDefaultTopics]);

  const loadBookmarks = useCallback(async () => {
    const db = await getDB();
    const result = await db.executeSql("SELECT page_number FROM bookmarks WHERE book_id = ? ORDER BY page_number ASC", [bookId]);
    const next: number[] = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      next.push(Number(result[0].rows.item(i).page_number));
    }
    setBookmarks(next);
  }, [bookId]);

  const loadMarksSummary = useCallback(async () => {
    const summary = await getBookMarksSummary(bookId);
    setMarksSummary(summary);
  }, [bookId]);

  const loadNotes = useCallback(async () => {
    const db = await getDB();
    const result = await db.executeSql(
      `SELECT n.id, n.page_number, n.content, n.updated_at, n.highlight_id, n.topic_id,
          h.color AS highlight_color,
          COALESCE(n.starred, 0) AS starred,
          COALESCE(n.note_kind, 'normal') AS note_kind
        FROM notes n
        LEFT JOIN highlights h ON h.id = n.highlight_id
        WHERE n.book_id = ?
        ORDER BY n.page_number ASC, n.updated_at DESC`,
      [bookId]
    );

    const next: ReaderNote[] = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      const row = result[0].rows.item(i) as ReaderNote & { highlight_color?: string | null };
      const kind = row.note_kind === "important" || row.note_kind === "doubt" ? row.note_kind : "normal";
      next.push({
        ...row,
        highlight_color: toOptionalHighlightColor(row.highlight_color),
        starred: Number(row.starred) || 0,
        note_kind: kind,
      });
    }
    setNotes(next);
  }, [bookId]);

  const fetchHighlightsForPage = useCallback(
    async (pageNumber: number) => {
      const db = await getDB();
      const result = await db.executeSql(
        `SELECT id, book_id, page_number, x, y, w, h, color, created_at, updated_at, topic_id
         FROM highlights
         WHERE book_id = ? AND page_number = ?
         ORDER BY created_at ASC`,
        [bookId, pageNumber]
      );

      const next: HighlightRow[] = [];
      for (let i = 0; i < result[0].rows.length; i++) {
        const row = result[0].rows.item(i) as HighlightRow & { color: string };
        next.push({ ...row, color: toHighlightColor(row.color) });
      }
      return next;
    },
    [bookId]
  );

  const fetchStrokesForPage = useCallback(
    async (pageNumber: number) => {
      const db = await getDB();
      const result = await db.executeSql(
        `SELECT id, book_id, page_number, topic_id, tool, color, width, points_json, created_at, updated_at
         FROM strokes
         WHERE book_id = ? AND page_number = ?
         ORDER BY created_at ASC`,
        [bookId, pageNumber]
      );

      const next: StrokeRow[] = [];
      for (let i = 0; i < result[0].rows.length; i++) {
        next.push(result[0].rows.item(i) as StrokeRow);
      }
      return next;
    },
    [bookId]
  );

  const primePageAnnotations = useCallback(
    async (pageNumber: number) => {
      const safePageNumber = clamp(Math.round(pageNumber), 1, Math.max(totalPages, 1));
      const cached = annotationCacheRef.current.get(safePageNumber);
      if (cached) return cached;

      const [pageHighlights, pageStrokes] = await Promise.all([
        fetchHighlightsForPage(safePageNumber),
        fetchStrokesForPage(safePageNumber),
      ]);
      const entry = { highlights: pageHighlights, strokes: pageStrokes };
      annotationCacheRef.current.set(safePageNumber, entry);
      return entry;
    },
    [fetchHighlightsForPage, fetchStrokesForPage, totalPages]
  );

  const loadPageAnnotations = useCallback(
    async (pageNumber: number) => {
      const entry = await primePageAnnotations(pageNumber);
      setHighlights(entry.highlights);
      setStrokes(entry.strokes);

      const neighbors = [pageNumber - 1, pageNumber + 1].filter(
        (candidate) => candidate >= 1 && candidate <= Math.max(totalPages, 1)
      );
      neighbors.forEach((candidate) => {
        primePageAnnotations(candidate).catch((error) => console.log("prefetch page annotations error", error));
      });
    },
    [primePageAnnotations, totalPages]
  );

  const invalidatePageCache = useCallback((pageNumber: number) => {
    annotationCacheRef.current.delete(pageNumber);
  }, []);

  useEffect(() => {
    annotationCacheRef.current.clear();
    loadBook().catch((e) => console.log("load book error", e));
    loadNotes().catch((e) => console.log("load notes error", e));
    loadTopics().catch((e) => console.log("load topics error", e));
    loadBookmarks().catch((e) => console.log("load bookmarks error", e));
    loadMarksSummary().catch((e) => console.log("load marks summary error", e));
  }, [loadBook, loadBookmarks, loadMarksSummary, loadNotes, loadTopics]);

  useFocusEffect(
    useCallback(() => {
      loadMarksSummary().catch((e) => console.log("focus marks summary error", e));
    }, [loadMarksSummary])
  );

  useEffect(() => {
    loadPageAnnotations(page).catch((e) => console.log("load annotations error", e));
  }, [loadPageAnnotations, page]);

  useEffect(() => {
    railCurrentPageSv.value = page;
  }, [page, railCurrentPageSv]);

  useEffect(() => {
    setSelectedHighlightId(null);
    setSelectedStrokeId(null);
    setMiniToolbar({ visible: false, x: 0, y: 0 });
    setHighlightSheetVisible(false);
    setStrokeSheetVisible(false);
    setHighlightNoteEditorVisible(false);
  }, [page]);

  useEffect(() => {
    if (!pendingJumpHighlightId) return;
    const found = highlights.find((item) => item.id === pendingJumpHighlightId);
    if (!found) return;
    setSelectedHighlightId(found.id);
    flashHighlight(found.id);
    setPendingJumpHighlightId(null);
  }, [flashHighlight, highlights, pendingJumpHighlightId]);

  useEffect(() => {
    return () => {
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    };
  }, []);

  const addPageNote = useCallback(
    async (content: string, kind: "normal" | "important" | "doubt") => {
      const db = await getDB();
      const now = Date.now();
      await db.executeSql(
        "INSERT INTO notes (id, book_id, page_number, content, highlight_id, topic_id, note_kind, starred, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)",
        [uid(), bookId, page, content, activeTopicId, kind, now, now]
      );
      await loadNotes();
    },
    [activeTopicId, bookId, loadNotes, page]
  );

  const updateNote = useCallback(
    async (id: string, content: string) => {
      const db = await getDB();
      await db.executeSql("UPDATE notes SET content = ?, updated_at = ? WHERE id = ?", [content, Date.now(), id]);
      await loadNotes();
    },
    [loadNotes]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const db = await getDB();
      await db.executeSql("DELETE FROM notes WHERE id = ?", [id]);
      await loadNotes();
    },
    [loadNotes]
  );

  const loadLinkedNoteDraft = useCallback(async (highlightId: string) => {
    const db = await getDB();
    const result = await db.executeSql("SELECT id, content FROM notes WHERE highlight_id = ? LIMIT 1", [highlightId]);
    const row = result[0].rows.length ? (result[0].rows.item(0) as { id: string; content: string }) : null;
    setLinkedNoteId(row?.id ?? null);
    setLinkedNoteText(row?.content ?? "");
  }, []);

  const toggleBookmark = useCallback(async () => {
    const db = await getDB();
    if (bookmarks.includes(page)) {
      await db.executeSql("DELETE FROM bookmarks WHERE book_id = ? AND page_number = ?", [bookId, page]);
    } else {
      await db.executeSql(
        "INSERT OR IGNORE INTO bookmarks (id, book_id, page_number, created_at) VALUES (?, ?, ?, ?)",
        [uid(), bookId, page, Date.now()]
      );
    }
    await Promise.all([loadBookmarks(), loadMarksSummary()]);
  }, [bookId, bookmarks, loadBookmarks, loadMarksSummary, page]);

  const saveHighlight = useCallback(
    async (rect: RectPx) => {
      if (!containerSize.width || !containerSize.height) return;
      if (rect.w < MIN_RECT_SIZE_PX || rect.h < MIN_RECT_SIZE_PX) return;

      const x = clamp(rect.x / containerSize.width, 0, 1);
      const y = clamp(rect.y / containerSize.height, 0, 1);
      const w = clamp(rect.w / containerSize.width, 0, 1);
      const h = clamp(rect.h / containerSize.height, 0, 1);
      if (w <= 0 || h <= 0) return;

      const db = await getDB();
      const id = uid();
      const now = Date.now();
      await db.executeSql(
        "INSERT INTO highlights (id, book_id, page_number, x, y, w, h, color, topic_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, bookId, page, x, y, w, h, "yellow", activeTopicId, now, now]
      );

      invalidatePageCache(page);
      setHighlights((prev) => [...prev, { id, book_id: bookId, page_number: page, x, y, w, h, color: "yellow", topic_id: activeTopicId, created_at: now, updated_at: now }]);
      await Promise.all([loadTopics(), loadMarksSummary()]);

      setSelectedHighlightId(id);
      flashHighlight(id);
      showMiniToolbarAt(rect.x + rect.w / 2, rect.y);
    },
    [activeTopicId, bookId, containerSize.height, containerSize.width, flashHighlight, invalidatePageCache, loadMarksSummary, loadTopics, page, showMiniToolbarAt]
  );

  const finishHighlightDraw = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => {
      if (!containerSize.width || !containerSize.height) return;
      const rect = normalizeRectPx(startX, startY, endX, endY, containerSize.width, containerSize.height);
      saveHighlight(rect).catch((e) => console.log("save highlight error", e));
    },
    [containerSize.height, containerSize.width, saveHighlight]
  );

  const saveStroke = useCallback(
    async (pointsPx: DraftStrokePoint[]) => {
      if (pointsPx.length < MIN_STROKE_POINTS || !containerSize.width || !containerSize.height) return;
      const style = getStrokeStyle(mode, toolStyles);
      const points = pointsPx.map((point) => toPercentPoint(point, containerSize.width, containerSize.height));
      if (points.length < MIN_STROKE_POINTS) return;

      const now = Date.now();
      const id = uid();
      const stroke: StrokeRow = {
        id,
        book_id: bookId,
        page_number: page,
        topic_id: activeTopicId,
        tool: style.tool,
        color: style.color,
        width: style.width,
        points_json: JSON.stringify(points),
        created_at: now,
        updated_at: now,
      };

      const db = await getDB();
      await db.executeSql(
        "INSERT INTO strokes (id, book_id, page_number, topic_id, tool, color, width, points_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          stroke.id,
          stroke.book_id,
          stroke.page_number,
          stroke.topic_id,
          stroke.tool,
          stroke.color,
          stroke.width,
          stroke.points_json,
          stroke.created_at,
          stroke.updated_at,
        ]
      );

      invalidatePageCache(page);
      setStrokes((prev) => [...prev, stroke]);
      await Promise.all([loadTopics(), loadMarksSummary()]);
    },
    [activeTopicId, bookId, containerSize.height, containerSize.width, invalidatePageCache, loadMarksSummary, loadTopics, mode, page, toolStyles]
  );

  const resetDrawPreview = useCallback(() => {
    drawStartRef.current = null;
    strokeDraftRef.current = [];
    previewRectVisibleSv.value = 0;
    previewRectWSv.value = 0;
    previewRectHSv.value = 0;
    activeStrokeSv.value = null;
  }, [activeStrokeSv, previewRectHSv, previewRectVisibleSv, previewRectWSv]);

  const setPreviewRectShared = useCallback(
    (rect: RectPx) => {
      previewRectXSv.value = rect.x;
      previewRectYSv.value = rect.y;
      previewRectWSv.value = rect.w;
      previewRectHSv.value = rect.h;
      previewRectVisibleSv.value = rect.w >= MIN_RECT_SIZE_PX && rect.h >= MIN_RECT_SIZE_PX ? 1 : 0;
    },
    [previewRectHSv, previewRectVisibleSv, previewRectWSv, previewRectXSv, previewRectYSv]
  );

  const pushLiveStrokePreview = useCallback(
    (nextMode: Mode, points: DraftStrokePoint[]) => {
      if (!containerSize.width || !containerSize.height) return;
      if (!(nextMode === "pen" || nextMode === "marker" || nextMode === "highlighter" || nextMode === "underline")) return;
      const style = getStrokeStyle(nextMode, toolStyles);
      const percentPoints: StrokePoint[] = points.map((point) => toPercentPoint(point, containerSize.width, containerSize.height));
      activeStrokeSv.value = {
        points: percentPoints,
        color: style.color,
        width: style.width,
        tool: style.tool,
      };
    },
    [activeStrokeSv, containerSize.height, containerSize.width, toolStyles]
  );

  const appendStrokePoint = useCallback(
    (draft: DraftStrokePoint[], nextPoint: PointPx, tool: ToolKind, baseWidth: number, force?: number) => {
      const now = Date.now();
      const previous = draft[draft.length - 1];
      if (!previous) {
        const startWidth = velocityToWidth(tool, baseWidth, 0);
        return [{ x: nextPoint.x, y: nextPoint.y, t: now, v: 0, w: startWidth, force }];
      }
      const dist = distancePx(previous, nextPoint);
      if (dist < 1.1) return draft;
      const dt = Math.max(1, now - previous.t);
      const velocity = (dist * 1000) / dt;
      const nextWidth = simulatePressureWidth({
        tool,
        baseWidth,
        velocity,
        previousWidth: previous.w || baseWidth,
        force,
      });
      return [...draft, { x: nextPoint.x, y: nextPoint.y, t: now, v: velocity, w: nextWidth, force }];
    },
    []
  );

  const onDrawGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (!drawEnabled || !containerSize.width || !containerSize.height) return;
      const { x: rawX, y: rawY } = event.nativeEvent;
      const native = event.nativeEvent as unknown as { force?: number };
      const force = typeof native.force === "number" ? native.force : undefined;
      const outside = rawX < 0 || rawY < 0 || rawX > containerSize.width || rawY > containerSize.height;
      if (outside) {
        resetDrawPreview();
        return;
      }
      const current: PointPx = {
        x: clamp(rawX, 0, containerSize.width),
        y: clamp(rawY, 0, containerSize.height),
      };

      if (mode === "highlight") {
        const start = drawStartRef.current;
        if (!start) return;
        setPreviewRectShared(normalizeRectPx(start.x, start.y, current.x, current.y, containerSize.width, containerSize.height));
        return;
      }

      if (mode === "underline") {
        const start = drawStartRef.current;
        if (!start) return;
        const now = Date.now();
        const speed = 0;
        const width = toolStyles.underline.width;
        const next: DraftStrokePoint[] = [
          { x: start.x, y: start.y, t: now - 1, v: speed, w: width, force },
          { x: current.x, y: current.y, t: now, v: speed, w: width, force },
        ];
        strokeDraftRef.current = next;
        pushLiveStrokePreview(mode, next);
        return;
      }

      if (mode === "pen" || mode === "marker" || mode === "highlighter") {
        const style = getStrokeStyle(mode, toolStyles);
        const draft = strokeDraftRef.current;
        const next = appendStrokePoint(draft, current, style.tool, style.width, force);
        if (next === draft) return;
        strokeDraftRef.current = next;
        pushLiveStrokePreview(mode, next);
      }
    },
    [
      appendStrokePoint,
      containerSize.height,
      containerSize.width,
      drawEnabled,
      mode,
      pushLiveStrokePreview,
      resetDrawPreview,
      setPreviewRectShared,
      toolStyles,
    ]
  );

  const onDrawHandlerStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      if (!drawEnabled || !containerSize.width || !containerSize.height) return;
      const { state, x: rawX, y: rawY } = event.nativeEvent;
      const native = event.nativeEvent as unknown as { force?: number };
      const force = typeof native.force === "number" ? native.force : undefined;
      const outside = rawX < 0 || rawY < 0 || rawX > containerSize.width || rawY > containerSize.height;
      if (outside && (state === State.ACTIVE || state === State.END)) {
        resetDrawPreview();
        return;
      }
      const point = {
        x: clamp(rawX, 0, containerSize.width),
        y: clamp(rawY, 0, containerSize.height),
      };

      if (state === State.BEGAN) {
        if (mode === "highlight") {
          drawStartRef.current = point;
          setPreviewRectShared({ x: point.x, y: point.y, w: 0, h: 0 });
          return;
        }

        if (mode === "underline") {
          drawStartRef.current = point;
          const now = Date.now();
          const width = toolStyles.underline.width;
          const draft = [
            { x: point.x, y: point.y, t: now - 1, v: 0, w: width, force },
            { x: point.x, y: point.y, t: now, v: 0, w: width, force },
          ];
          strokeDraftRef.current = draft;
          pushLiveStrokePreview(mode, draft);
        }

        if (mode === "pen" || mode === "marker" || mode === "highlighter") {
          const style = getStrokeStyle(mode, toolStyles);
          const draft = appendStrokePoint([], point, style.tool, style.width, force);
          strokeDraftRef.current = draft;
          pushLiveStrokePreview(mode, draft);
        }
        return;
      }

      if (state === State.ACTIVE) {
        if (mode === "highlight") {
          const start = drawStartRef.current;
          if (!start) return;
          setPreviewRectShared(normalizeRectPx(start.x, start.y, point.x, point.y, containerSize.width, containerSize.height));
        }
        return;
      }

      if (state === State.END) {
        if (mode === "highlight") {
          const start = drawStartRef.current;
          if (!start) return;
          finishHighlightDraw(start.x, start.y, point.x, point.y);
          resetDrawPreview();
          return;
        }

        if (mode === "underline") {
          const start = drawStartRef.current;
          if (!start) {
            resetDrawPreview();
            return;
          }
          const now = Date.now();
          const width = toolStyles.underline.width;
          const draft = [
            { x: start.x, y: start.y, t: now - 1, v: 0, w: width, force },
            { x: point.x, y: point.y, t: now, v: 0, w: width, force },
          ];
          saveStroke(draft).catch((e) => console.log("save underline error", e));
          resetDrawPreview();
          return;
        }

        if (mode === "pen" || mode === "marker" || mode === "highlighter") {
          const style = getStrokeStyle(mode, toolStyles);
          const completed = appendStrokePoint(strokeDraftRef.current, point, style.tool, style.width, force);
          saveStroke(completed).catch((e) => console.log("save stroke error", e));
          resetDrawPreview();
        }
        return;
      }

      if (state === State.CANCELLED || state === State.FAILED) {
        resetDrawPreview();
      }
    },
    [
      containerSize.height,
      containerSize.width,
      drawEnabled,
      appendStrokePoint,
      finishHighlightDraw,
      mode,
      pushLiveStrokePreview,
      resetDrawPreview,
      saveStroke,
      setPreviewRectShared,
      toolStyles,
    ]
  );

  const openHighlightActions = useCallback(
    async (highlight: HighlightRow) => {
      setSelectedHighlightId(highlight.id);
      flashHighlight(highlight.id);

      if (containerSize.width && containerSize.height) {
        showMiniToolbarAt(highlight.x * containerSize.width + (highlight.w * containerSize.width) / 2, highlight.y * containerSize.height);
      }

      await loadLinkedNoteDraft(highlight.id);
      setHighlightNoteEditorVisible(false);
      setHighlightSheetVisible(true);
    },
    [containerSize.height, containerSize.width, flashHighlight, loadLinkedNoteDraft, showMiniToolbarAt]
  );

  const saveLinkedNote = useCallback(async () => {
    if (!selectedHighlight) return;

    const content = linkedNoteText.trim();
    const now = Date.now();
    const db = await getDB();

    if (!content) {
      if (linkedNoteId) {
        await db.executeSql("DELETE FROM notes WHERE id = ?", [linkedNoteId]);
        setLinkedNoteId(null);
      }
      await loadNotes();
      return;
    }

    if (linkedNoteId) {
      await db.executeSql("UPDATE notes SET content = ?, note_kind = ?, topic_id = ?, updated_at = ? WHERE id = ?", [
        content,
        COLOR_TO_KIND[selectedHighlight.color],
        selectedHighlight.topic_id ?? null,
        now,
        linkedNoteId,
      ]);
    } else {
      const noteId = uid();
      await db.executeSql(
        "INSERT INTO notes (id, book_id, page_number, content, highlight_id, topic_id, note_kind, starred, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        [
          noteId,
          bookId,
          selectedHighlight.page_number,
          content,
          selectedHighlight.id,
          selectedHighlight.topic_id ?? null,
          COLOR_TO_KIND[selectedHighlight.color],
          now,
          now,
        ]
      );
      setLinkedNoteId(noteId);
    }

    await loadNotes();
    setHighlightNoteEditorVisible(false);
  }, [bookId, linkedNoteId, linkedNoteText, loadNotes, selectedHighlight]);

  const updateHighlightColor = useCallback(
    async (color: HighlightColor) => {
      if (!selectedHighlightId) return;
      const db = await getDB();
      const now = Date.now();
      await db.executeSql("UPDATE highlights SET color = ?, updated_at = ? WHERE id = ?", [color, now, selectedHighlightId]);

      invalidatePageCache(page);
      setHighlights((prev) => prev.map((item) => (item.id === selectedHighlightId ? { ...item, color, updated_at: now } : item)));
      if (linkedNoteId) {
        await db.executeSql("UPDATE notes SET note_kind = ?, updated_at = ? WHERE id = ?", [COLOR_TO_KIND[color], now, linkedNoteId]);
        await loadNotes();
      }
      resetToolbarTimer();
    },
    [invalidatePageCache, linkedNoteId, loadNotes, page, resetToolbarTimer, selectedHighlightId]
  );

  const assignTopicToSelectedHighlight = useCallback(
    async (topicId: string | null) => {
      if (!selectedHighlightId) return;
      const db = await getDB();
      const now = Date.now();
      await db.executeSql("UPDATE highlights SET topic_id = ?, updated_at = ? WHERE id = ?", [topicId, now, selectedHighlightId]);
      await db.executeSql("UPDATE notes SET topic_id = ?, updated_at = ? WHERE highlight_id = ?", [topicId, now, selectedHighlightId]);

      invalidatePageCache(page);
      setHighlights((prev) => prev.map((item) => (item.id === selectedHighlightId ? { ...item, topic_id: topicId, updated_at: now } : item)));
      await Promise.all([loadTopics(), loadNotes()]);
    },
    [invalidatePageCache, loadNotes, loadTopics, page, selectedHighlightId]
  );

  const deleteSelectedHighlight = useCallback(async () => {
    if (!selectedHighlightId) return;
    const db = await getDB();
    await db.executeSql("DELETE FROM highlights WHERE id = ?", [selectedHighlightId]);
    await db.executeSql("DELETE FROM notes WHERE highlight_id = ?", [selectedHighlightId]);

    invalidatePageCache(page);
    setHighlights((prev) => prev.filter((item) => item.id !== selectedHighlightId));
    setSelectedHighlightId(null);
    setLinkedNoteId(null);
    setLinkedNoteText("");
    setHighlightNoteEditorVisible(false);
    setHighlightSheetVisible(false);
    setMiniToolbar({ visible: false, x: 0, y: 0 });

    await Promise.all([loadNotes(), loadTopics(), loadMarksSummary()]);
  }, [invalidatePageCache, loadMarksSummary, loadNotes, loadTopics, page, selectedHighlightId]);

  const onPressStroke = useCallback(
    (stroke: StrokeRow) => {
      if (mode === "eraser") {
        const removeStroke = async () => {
          const db = await getDB();
          await db.executeSql("DELETE FROM strokes WHERE id = ?", [stroke.id]);
          invalidatePageCache(stroke.page_number);
          setStrokes((prev) => prev.filter((item) => item.id !== stroke.id));
          await Promise.all([loadTopics(), loadMarksSummary()]);
        };
        removeStroke().catch((e) => console.log("erase stroke error", e));
        return;
      }

      if (mode !== "stroke_select") return;
      setSelectedStrokeId(stroke.id);
      setStrokeSheetVisible(true);
    },
    [invalidatePageCache, loadMarksSummary, loadTopics, mode]
  );

  const deleteSelectedStroke = useCallback(async () => {
    if (!selectedStrokeId) return;
    const db = await getDB();
    await db.executeSql("DELETE FROM strokes WHERE id = ?", [selectedStrokeId]);
    invalidatePageCache(page);
    setStrokes((prev) => prev.filter((item) => item.id !== selectedStrokeId));
    setSelectedStrokeId(null);
    setStrokeSheetVisible(false);
    await Promise.all([loadTopics(), loadMarksSummary()]);
  }, [invalidatePageCache, loadMarksSummary, loadTopics, page, selectedStrokeId]);

  const assignTopicToSelectedStroke = useCallback(
    async (topicId: string | null) => {
      if (!selectedStrokeId) return;
      const db = await getDB();
      const now = Date.now();
      await db.executeSql("UPDATE strokes SET topic_id = ?, updated_at = ? WHERE id = ?", [topicId, now, selectedStrokeId]);
      invalidatePageCache(page);
      setStrokes((prev) => prev.map((item) => (item.id === selectedStrokeId ? { ...item, topic_id: topicId, updated_at: now } : item)));
      await loadTopics();
    },
    [invalidatePageCache, loadTopics, page, selectedStrokeId]
  );

  const jumpToPage = useCallback(
    (targetPage: number) => {
      const nextPage = clamp(Math.round(targetPage), 1, Math.max(1, totalPages));
      if (nextPage === pageRef.current) return;
      pageRef.current = nextPage;
      railCurrentPageSv.value = nextPage;
      setPage(nextPage);
    },
    [railCurrentPageSv, totalPages]
  );

  const nextPage = useCallback(() => {
    jumpToPage(page + 1);
  }, [jumpToPage, page]);

  const previousPage = useCallback(() => {
    jumpToPage(page - 1);
  }, [jumpToPage, page]);

  const onPdfPageChanged = useCallback(
    (nextPageNumber: number) => {
      if (nextPageNumber === pageRef.current) return;
      pageRef.current = nextPageNumber;
      railCurrentPageSv.value = nextPageNumber;
      setPage(nextPageNumber);
    },
    [railCurrentPageSv]
  );

  const onPressNote = useCallback(
    (note: ReaderNote) => {
      jumpToPage(note.page_number);
      if (note.highlight_id) {
        setPendingJumpHighlightId(note.highlight_id);
      }
      setNotesVisible(false);
    },
    [jumpToPage]
  );

  const toggleTopicVisibility = useCallback(
    async (topicId: string, nextVisible: number) => {
      const db = await getDB();
      await db.executeSql("UPDATE topics SET is_visible = ?, updated_at = ? WHERE id = ?", [nextVisible, Date.now(), topicId]);
      await loadTopics();
    },
    [loadTopics]
  );

  const addTopic = useCallback(() => {
    const color = TOPIC_PRESET[topics.length % TOPIC_PRESET.length]?.color ?? "#91a4b5";
    setTopicEditor({ visible: true, mode: "add", topicId: null, name: "", color });
  }, [topics.length]);

  const renameOrDeleteTopic = useCallback(
    (topicId: string) => {
      const target = topics.find((item) => item.id === topicId);
      if (!target) return;

      Alert.alert(target.name, "Rename or delete topic", [
        {
          text: "Rename",
          onPress: () =>
            setTopicEditor({
              visible: true,
              mode: "rename",
              topicId,
              name: target.name,
              color: target.color,
            }),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const db = await getDB();
            await db.executeSql("UPDATE highlights SET topic_id = NULL WHERE topic_id = ?", [topicId]);
            await db.executeSql("UPDATE strokes SET topic_id = NULL WHERE topic_id = ?", [topicId]);
            await db.executeSql("UPDATE notes SET topic_id = NULL WHERE topic_id = ?", [topicId]);
            await db.executeSql("DELETE FROM topics WHERE id = ?", [topicId]);
            invalidatePageCache(page);
            await Promise.all([loadTopics(), loadPageAnnotations(page), loadNotes()]);
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [invalidatePageCache, loadNotes, loadPageAnnotations, loadTopics, page, topics]
  );

  const saveTopicEditor = useCallback(async () => {
    const name = topicEditor.name.trim();
    if (!name) return;

    const db = await getDB();
    const now = Date.now();

    if (topicEditor.mode === "add") {
      const color = topicEditor.color || TOPIC_PRESET[topics.length % TOPIC_PRESET.length]?.color || "#91a4b5";
      const topicId = uid();
      await db.executeSql(
        "INSERT INTO topics (id, book_id, name, color, is_visible, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
        [topicId, bookId, name, color, now, now]
      );
      setActiveTopicId(topicId);
    } else if (topicEditor.topicId) {
      await db.executeSql("UPDATE topics SET name = ?, updated_at = ? WHERE id = ?", [name, now, topicEditor.topicId]);
    }

    setTopicEditor({ visible: false, mode: "add", topicId: null, name: "", color: TOPIC_PRESET[0].color });
    await loadTopics();
  }, [bookId, loadTopics, topicEditor, topics.length]);

  const closeExportModal = useCallback(() => {
    if (exportState.status === "running") return;
    setExportState({
      visible: false,
      status: "idle",
      progressPct: 0,
      pageNumber: 0,
      totalPages: 0,
      outputPath: null,
      errorMessage: null,
    });
  }, [exportState.status]);

  const openExportedPdf = useCallback(async () => {
    if (!exportState.outputPath) return;
    const fileUrl = exportState.outputPath.startsWith("file://") ? exportState.outputPath : `file://${exportState.outputPath}`;
    const supported = await Linking.canOpenURL(fileUrl);
    if (!supported) {
      Alert.alert("Open failed", "This device could not open the exported PDF directly.");
      return;
    }
    await Linking.openURL(fileUrl);
  }, [exportState.outputPath]);

  const shareExportedPdf = useCallback(async () => {
    if (!book || !exportState.outputPath) return;
    const fileUrl = exportState.outputPath.startsWith("file://") ? exportState.outputPath : `file://${exportState.outputPath}`;
    await Share.share({
      title: `${book.title} annotated PDF`,
      url: fileUrl,
      message: `Annotated PDF for ${book.title}`,
    });
  }, [book, exportState.outputPath]);

  const startExport = useCallback(async () => {
    if (exportState.status === "running") return;
    if (!book || !book.local_path) {
      Alert.alert("Export failed", "Original PDF path is missing for this book.");
      return;
    }

    exportCancelRef.current = false;
    setExportState({
      visible: true,
      status: "running",
      progressPct: 0,
      pageNumber: 0,
      totalPages: 0,
      outputPath: null,
      errorMessage: null,
    });

    try {
      const result = await exportAnnotatedPdf({
        bookId,
        inputPdfPath: book.local_path,
        outputDir: EXPORTS_DIR,
        referencePageSizePx: {
          width: Math.max(1, containerSize.width),
          height: Math.max(1, containerSize.height),
        },
        onProgress: ({ pageNumber, totalPages: exportTotalPages, progressPct }) => {
          setExportState((prev) => ({
            ...prev,
            visible: true,
            status: "running",
            pageNumber,
            totalPages: exportTotalPages,
            progressPct,
          }));
        },
        shouldCancel: () => exportCancelRef.current,
      });

      setExportState((prev) => ({
        ...prev,
        visible: true,
        status: "success",
        progressPct: 100,
        outputPath: result.outputPath,
        errorMessage: null,
      }));
    } catch (error) {
      if (error instanceof ExportCancelledError) {
        setExportState({
          visible: false,
          status: "idle",
          progressPct: 0,
          pageNumber: 0,
          totalPages: 0,
          outputPath: null,
          errorMessage: null,
        });
        Alert.alert("Export cancelled", "Annotated PDF export was cancelled.");
        return;
      }

      const message =
        error instanceof ExportPageError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not export the annotated PDF.";

      setExportState((prev) => ({
        ...prev,
        visible: true,
        status: "error",
        errorMessage: message,
      }));
      Alert.alert("Export failed", message);
    }
  }, [book, bookId, containerSize.height, containerSize.width, exportState.status]);

  if (!book || !source) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading reader...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <View pointerEvents="none" style={styles.backgroundWashTop} />
      <View pointerEvents="none" style={styles.backgroundWashBottom} />

      <PremiumHeader
        title={book.title}
        page={page}
        totalPages={totalPages}
        currentPageNotes={currentPageNotes.length}
        currentPageMarks={currentPageMarks}
        currentPageTopicCount={currentPageTopicCount}
        onPressBack={navigation.goBack}
        onPressMore={() => setMoreMenuVisible(true)}
      />

      <View style={styles.readerArea}>
        <SinglePagePdfView
          source={source}
          pdfRef={pdfRef}
          pageNumber={page}
          totalPages={totalPages}
          interactionLocked={overlayCaptureEnabled}
          onLayoutSize={onStageLayoutSize}
          onLoadComplete={setTotalPages}
          onPageChanged={onPdfPageChanged}
          onError={onPdfError}
          onNextPage={nextPage}
          onPreviousPage={previousPage}
          renderOverlay={(metrics) => (
            <OverlayRoot
              pageNumber={metrics.pageNumber}
              containerWidth={metrics.containerWidth}
              containerHeight={metrics.containerHeight}
              highlights={visibleHighlights}
              strokes={visibleStrokes}
              activeHighlightId={activeGlowHighlightId}
              highlightDisabled={highlightMode}
              activeStroke={activeStrokeSv}
              eraseMode={eraseMode}
              strokeSelectable={strokeSelectMode}
              captureGestures={overlayCaptureEnabled}
              onPressHighlight={(item) => openHighlightActions(item).catch((e) => console.log("open highlight error", e))}
              onPressStroke={onPressStroke}
            >
              <Animated.View pointerEvents="none" style={[styles.previewRect, previewRectAnimatedStyle]} />

              <PanGestureHandler
                enabled={drawEnabled}
                onGestureEvent={onDrawGestureEvent}
                onHandlerStateChange={onDrawHandlerStateChange}
              >
                <View style={StyleSheet.absoluteFillObject} pointerEvents={drawEnabled ? "auto" : "none"} />
              </PanGestureHandler>
            </OverlayRoot>
          )}
        />

        <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
          <MarksRail
            totalPages={totalPages}
            currentPage={page}
            currentPageSv={railCurrentPageSv}
            marksSummary={marksSummary}
            onJumpToPage={jumpToPage}
          />

          <HighlightMiniToolbar
            visible={miniToolbar.visible && !!selectedHighlight}
            x={miniToolbar.x}
            y={miniToolbar.y}
            color={selectedHighlight?.color ?? "yellow"}
            onAddNote={() => {
              if (!selectedHighlight) return;
              loadLinkedNoteDraft(selectedHighlight.id)
                .then(() => {
                  setHighlightNoteEditorVisible(true);
                  setHighlightSheetVisible(true);
                })
                .catch((e) => console.log("load linked note error", e));
              resetToolbarTimer();
            }}
            onChangeColor={(color) => updateHighlightColor(color).catch((e) => console.log("color update error", e))}
            onDelete={() => deleteSelectedHighlight().catch((e) => console.log("delete highlight error", e))}
          />

          <FloatingToolBar
            mode={mode}
            highlightMode={highlightMode}
            penMode={penMode}
            revisionMode={revisionMode}
            revisionImportantOnly={revisionImportantOnly}
            isBookmarked={isBookmarked}
            toolStyles={toolStyles}
            onToggleHighlight={() => {
              setMode((prev) => {
                const next = prev === "highlight" ? "none" : "highlight";
                if (next === "none") resetDrawPreview();
                return next;
              });
            }}
            onTogglePen={() => {
              setMode((prev) => {
                if (
                  prev === "pen" ||
                  prev === "marker" ||
                  prev === "highlighter" ||
                  prev === "underline" ||
                  prev === "eraser" ||
                  prev === "stroke_select"
                ) {
                  resetDrawPreview();
                  return "none";
                }
                return "pen";
              });
            }}
            onToggleBookmark={() => toggleBookmark().catch((e) => console.log("bookmark error", e))}
            onPressTopics={() => setTopicsVisible(true)}
            onPressMore={() => setMoreMenuVisible(true)}
            onSetMode={setMode}
            onAdjustWidth={(delta) =>
              setToolStyles((prev) => {
                const current =
                  mode === "pen" || mode === "marker" || mode === "highlighter" || mode === "underline" ? mode : "pen";
                return {
                  ...prev,
                  [current]: { ...prev[current], width: clamp(prev[current].width + delta, 1, 36) },
                };
              })
            }
            onSelectColor={(color) =>
              setToolStyles((prev) => {
                const current =
                  mode === "pen" || mode === "marker" || mode === "highlighter" || mode === "underline" ? mode : "pen";
                return {
                  ...prev,
                  [current]: { ...prev[current], color },
                };
              })
            }
          />

          <Pressable style={styles.notesFab} onPress={() => setNotesVisible(true)}>
            <Text style={styles.notesFabLabel}>Notes</Text>
            <Text style={styles.notesFabMeta}>{`${currentPageNotes.length} on this page`}</Text>
          </Pressable>
        </View>
      </View>

      <PageNavigationBar
        currentPage={page}
        totalPages={totalPages}
        onPrevious={previousPage}
        onNext={nextPage}
        onJumpToPage={jumpToPage}
      />

      <NotesBottomSheet
        visible={notesVisible}
        notes={notes}
        currentPage={page}
        onClose={() => setNotesVisible(false)}
        onAddNote={(content, kind) => addPageNote(content, kind).catch((e) => console.log("add note error", e))}
        onPressNote={onPressNote}
        onDeleteNote={(id) => deleteNote(id).catch((e) => console.log("delete note error", e))}
        onUpdateNote={(id, content) => updateNote(id, content).catch((e) => console.log("update note error", e))}
      />

      <TopicsDrawer
        visible={topicsVisible}
        topics={topicsWithPageStats}
        currentPage={page}
        activeTopicId={activeTopicId}
        onClose={() => setTopicsVisible(false)}
        onSelectTopic={setActiveTopicId}
        onToggleVisibility={(topicId, nextVisible) =>
          toggleTopicVisibility(topicId, nextVisible).catch((e) => console.log("topic visibility error", e))
        }
        onAddTopic={addTopic}
        onLongPressTopic={renameOrDeleteTopic}
      />

      <Modal visible={moreMenuVisible} transparent animationType="fade" onRequestClose={() => setMoreMenuVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoreMenuVisible(false)} />
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>Reader actions</Text>
            <Text style={styles.sheetSectionLabel}>Keep the page clean while secondary actions stay here.</Text>

            <Pressable
              style={[styles.sheetPrimaryBtn, revisionMode ? styles.sheetPrimaryBtnMuted : null]}
              onPress={() => {
                setRevisionMode((prev) => !prev);
                setMoreMenuVisible(false);
              }}
            >
              <Text style={styles.sheetPrimaryBtnText}>{revisionMode ? "Exit revision mode" : "Enter revision mode"}</Text>
            </Pressable>

            {revisionMode ? (
              <Pressable
                style={styles.exportSecondaryBtn}
                onPress={() => setRevisionImportantOnly((prev) => !prev)}
              >
                <Text style={styles.exportSecondaryBtnText}>
                  {revisionImportantOnly ? "Show all revision marks" : "Show important revision marks"}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={styles.exportPrimaryBtn}
              onPress={() => {
                setMoreMenuVisible(false);
                startExport().catch((e) => console.log("export error", e));
              }}
            >
              <Text style={styles.exportPrimaryBtnText}>Export annotated PDF</Text>
            </Pressable>

            <Pressable style={styles.topicEditorButton} onPress={() => setMoreMenuVisible(false)}>
              <Text style={styles.topicEditorButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={highlightSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setHighlightSheetVisible(false);
          setHighlightNoteEditorVisible(false);
        }}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setHighlightSheetVisible(false);
              setHighlightNoteEditorVisible(false);
            }}
          />
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>Highlight Actions</Text>
            <Text style={styles.sheetSectionLabel}>Page {selectedHighlight?.page_number ?? page}</Text>
            <Pressable style={styles.sheetPrimaryBtn} onPress={() => setHighlightNoteEditorVisible(true)}>
              <Text style={styles.sheetPrimaryBtnText}>{linkedNoteId ? "Edit Note" : "Add Note"}</Text>
            </Pressable>

            {highlightNoteEditorVisible ? (
              <View style={styles.noteEditorCard}>
                <TextInput
                  value={linkedNoteText}
                  onChangeText={setLinkedNoteText}
                  placeholder="Write note for this highlight..."
                  multiline
                  style={styles.sheetInput}
                />
                <View style={styles.noteEditorActions}>
                  <Pressable style={styles.noteEditorButton} onPress={() => setHighlightNoteEditorVisible(false)}>
                    <Text style={styles.noteEditorButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.noteEditorButtonPrimary} onPress={() => saveLinkedNote().catch((e) => console.log("save linked note error", e))}>
                    <Text style={styles.noteEditorButtonPrimaryText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.colorLegendRow}>
              {(Object.keys(COLOR_LABELS) as HighlightColor[]).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => updateHighlightColor(item).catch((e) => console.log("highlight color error", e))}
                    style={[
                      styles.legendChip,
                      selectedHighlight?.color === item ? styles.legendChipActive : null,
                      { borderColor: HIGHLIGHT_LEGEND_BORDER[item] },
                    ]}
                  >
                  <Text style={styles.legendChipText}>{COLOR_LABELS[item]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sheetSectionLabel}>Assign Topic</Text>
            <View style={styles.topicChipsRow}>
              <Pressable
                onPress={() => assignTopicToSelectedHighlight(null).catch((e) => console.log("clear topic error", e))}
                style={[styles.topicChip, !selectedHighlight?.topic_id ? styles.topicChipActive : null]}
              >
                <Text style={styles.topicChipText}>No Topic</Text>
              </Pressable>
              {topics.map((topic) => (
                <Pressable
                  key={topic.id}
                  onPress={() => assignTopicToSelectedHighlight(topic.id).catch((e) => console.log("assign topic error", e))}
                  style={[
                    styles.topicChip,
                    selectedHighlight?.topic_id === topic.id ? styles.topicChipActive : null,
                    { borderColor: topic.color },
                  ]}
                >
                  <Text style={styles.topicChipText}>{topic.name}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.sheetDangerBtn} onPress={() => deleteSelectedHighlight().catch((e) => console.log("delete error", e))}>
              <Text style={styles.sheetDangerBtnText}>Delete Highlight</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={strokeSheetVisible} transparent animationType="fade" onRequestClose={() => setStrokeSheetVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStrokeSheetVisible(false)} />
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>
              {selectedStroke?.tool === "marker"
                ? "Marker"
                : selectedStroke?.tool === "highlighter"
                  ? "Highlighter"
                  : selectedStroke?.tool === "underline"
                    ? "Underline"
                    : "Pen"}{" "}
              Stroke
            </Text>

            <Text style={styles.sheetSectionLabel}>Assign Topic</Text>
            <View style={styles.topicChipsRow}>
              <Pressable
                onPress={() => assignTopicToSelectedStroke(null).catch((e) => console.log("clear stroke topic error", e))}
                style={[styles.topicChip, !selectedStroke?.topic_id ? styles.topicChipActive : null]}
              >
                <Text style={styles.topicChipText}>No Topic</Text>
              </Pressable>
              {topics.map((topic) => (
                <Pressable
                  key={topic.id}
                  onPress={() => assignTopicToSelectedStroke(topic.id).catch((e) => console.log("assign stroke topic error", e))}
                  style={[
                    styles.topicChip,
                    selectedStroke?.topic_id === topic.id ? styles.topicChipActive : null,
                    { borderColor: topic.color },
                  ]}
                >
                  <Text style={styles.topicChipText}>{topic.name}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.sheetDangerBtn} onPress={() => deleteSelectedStroke().catch((e) => console.log("delete stroke error", e))}>
              <Text style={styles.sheetDangerBtnText}>Delete Stroke</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={topicEditor.visible} transparent animationType="fade" onRequestClose={() => setTopicEditor((prev) => ({ ...prev, visible: false }))}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTopicEditor((prev) => ({ ...prev, visible: false }))} />
          <View style={styles.topicEditorCard}>
            <Text style={styles.topicEditorTitle}>{topicEditor.mode === "add" ? "Add Topic" : "Rename Topic"}</Text>
            <TextInput
              value={topicEditor.name}
              onChangeText={(name) => setTopicEditor((prev) => ({ ...prev, name }))}
              placeholder="Topic name"
              style={styles.topicEditorInput}
            />
            {topicEditor.mode === "add" ? (
              <>
                <Text style={styles.sheetSectionLabel}>Color</Text>
                <View style={styles.topicColorRow}>
                  {["#ffd84f", "#4dd589", "#5aa7ff", "#f67bc4", "#91a4b5", "#f69a58"].map((color) => {
                    const selected = topicEditor.color === color;
                    return (
                      <Pressable
                        key={color}
                        onPress={() => setTopicEditor((prev) => ({ ...prev, color }))}
                        style={[styles.topicColorSwatch, selected ? styles.topicColorSwatchActive : null, { backgroundColor: color }]}
                      />
                    );
                  })}
                </View>
              </>
            ) : null}
            <View style={styles.topicEditorActions}>
              <Pressable
                style={styles.topicEditorButton}
                onPress={() => setTopicEditor({ visible: false, mode: "add", topicId: null, name: "", color: TOPIC_PRESET[0].color })}
              >
                <Text style={styles.topicEditorButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.topicEditorButton, styles.topicEditorPrimary]} onPress={() => saveTopicEditor().catch((e) => console.log("save topic error", e))}>
                <Text style={styles.topicEditorPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={exportState.visible} transparent animationType="fade" onRequestClose={closeExportModal}>
        <View style={styles.overlay}>
          {exportState.status === "running" ? null : <Pressable style={StyleSheet.absoluteFill} onPress={closeExportModal} />}
          <View style={styles.exportCard}>
            <Text style={styles.exportTitle}>
              {exportState.status === "success"
                ? "Export complete"
                : exportState.status === "error"
                  ? "Export failed"
                  : "Exporting annotated PDF"}
            </Text>

            {exportState.status === "running" ? (
              <>
                <ActivityIndicator size="small" color="#1f6fde" />
                <Text style={styles.exportSubtitle}>
                  Exporting page {Math.max(exportState.pageNumber, 1)} of {Math.max(exportState.totalPages, totalPages, 1)}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${clamp(exportState.progressPct, 0, 100)}%` }]} />
                </View>
                <Text style={styles.progressLabel}>{clamp(exportState.progressPct, 0, 100)}%</Text>
                <Pressable
                  style={styles.sheetDangerBtn}
                  onPress={() => {
                    exportCancelRef.current = true;
                  }}
                >
                  <Text style={styles.sheetDangerBtnText}>Cancel</Text>
                </Pressable>
              </>
            ) : null}

            {exportState.status === "success" ? (
              <>
                <Text style={styles.exportSubtitle}>Saved to {exportState.outputPath}</Text>
                <View style={styles.exportActionsRow}>
                  <Pressable style={styles.exportSecondaryBtn} onPress={() => openExportedPdf().catch((e) => console.log("open export error", e))}>
                    <Text style={styles.exportSecondaryBtnText}>Open</Text>
                  </Pressable>
                  <Pressable style={styles.exportPrimaryBtn} onPress={() => shareExportedPdf().catch((e) => console.log("share export error", e))}>
                    <Text style={styles.exportPrimaryBtnText}>Share</Text>
                  </Pressable>
                </View>
                <Pressable style={styles.topicEditorButton} onPress={closeExportModal}>
                  <Text style={styles.topicEditorButtonText}>Close</Text>
                </Pressable>
              </>
            ) : null}

            {exportState.status === "error" ? (
              <>
                <Text style={styles.exportSubtitle}>{exportState.errorMessage ?? "Could not export the annotated PDF."}</Text>
                <Pressable style={styles.exportPrimaryBtn} onPress={closeExportModal}>
                  <Text style={styles.exportPrimaryBtnText}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f1e8",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f6f1e8",
  },
  loadingText: {
    color: "#5f5449",
    fontWeight: "700",
  },
  backgroundWashTop: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(232, 221, 204, 0.7)",
  },
  backgroundWashBottom: {
    position: "absolute",
    left: -80,
    bottom: 160,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(245, 236, 223, 0.9)",
  },
  readerArea: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  previewRect: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#4c7fd8",
    backgroundColor: "rgba(113, 154, 231, 0.18)",
  },
  notesFab: {
    position: "absolute",
    right: 20,
    top: 20,
    minWidth: 108,
    minHeight: 62,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    shadowColor: "#6f6354",
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  notesFabLabel: {
    color: "#1f1a16",
    fontWeight: "800",
    fontSize: 14,
  },
  notesFabMeta: {
    marginTop: 3,
    color: "#7c6f62",
    fontSize: 11,
    fontWeight: "600",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    backgroundColor: "rgba(7, 14, 22, 0.24)",
  },
  actionSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  actionSheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#112334",
  },
  sheetSectionLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#20313f",
  },
  sheetInput: {
    minHeight: 86,
    borderWidth: 1,
    borderColor: "#d8e0e8",
    borderRadius: 12,
    padding: 10,
    textAlignVertical: "top",
  },
  sheetPrimaryBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#206fdc",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetPrimaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  sheetPrimaryBtnMuted: {
    backgroundColor: "#3a332d",
  },
  noteEditorCard: {
    borderWidth: 1,
    borderColor: "#d8e0e8",
    borderRadius: 12,
    padding: 10,
    gap: 10,
    backgroundColor: "#f9fcff",
  },
  noteEditorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  noteEditorButton: {
    minHeight: 38,
    minWidth: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c8d4df",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f8fb",
  },
  noteEditorButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1d3345",
  },
  noteEditorButtonPrimary: {
    minHeight: 38,
    minWidth: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2c71d8",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#e6f0ff",
  },
  noteEditorButtonPrimaryText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1458bd",
  },
  colorLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  legendChip: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "#f8fbff",
  },
  legendChipActive: {
    backgroundColor: "#eaf2ff",
  },
  legendChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#183046",
  },
  topicChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  topicChip: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c8d5df",
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "#f8fbff",
  },
  topicChipActive: {
    backgroundColor: "#e5f2ff",
    borderColor: "#2d74de",
  },
  topicChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#183046",
  },
  sheetDangerBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ecbcc1",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetDangerBtnText: {
    color: "#b12e3d",
    fontWeight: "800",
  },
  topicEditorCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 14,
    gap: 10,
  },
  topicEditorTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#122433",
  },
  topicEditorInput: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d2dce5",
    paddingHorizontal: 10,
  },
  topicColorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  topicColorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#c7d2dc",
  },
  topicColorSwatchActive: {
    borderColor: "#0f1820",
    borderWidth: 2,
  },
  topicEditorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  topicEditorButton: {
    minHeight: 40,
    minWidth: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c8d4df",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f8fb",
  },
  topicEditorButtonText: {
    fontWeight: "700",
    color: "#1d3345",
  },
  topicEditorPrimary: {
    borderColor: "#2c71d8",
    backgroundColor: "#e6f0ff",
  },
  topicEditorPrimaryText: {
    fontWeight: "800",
    color: "#1458bd",
  },
  exportCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 18,
    backgroundColor: "#fff",
    padding: 16,
    gap: 12,
  },
  exportTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#112334",
  },
  exportSubtitle: {
    fontSize: 13,
    color: "#405262",
    lineHeight: 19,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e5edf6",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#1f6fde",
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1f6fde",
    textAlign: "right",
  },
  exportActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  exportPrimaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#1f6fde",
    justifyContent: "center",
    alignItems: "center",
  },
  exportPrimaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  exportSecondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c9d5df",
    backgroundColor: "#f6f9fc",
    justifyContent: "center",
    alignItems: "center",
  },
  exportSecondaryBtnText: {
    color: "#1d3345",
    fontWeight: "700",
  },
});
