import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import Pdf from "react-native-pdf";
import { getDB } from "../db";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { uid } from "../utils/files";
import TopToolbar from "../components/TopToolbar";
import NotesBottomSheet, { type ReaderNote } from "../components/NotesBottomSheet";
import TopicsDrawer, { type ReaderTopic } from "../components/TopicsDrawer";
import HighlightMiniToolbar, { type HighlightColor } from "../components/HighlightMiniToolbar";
import HighlightLayer, { type HighlightRow } from "./components/HighlightLayer";

type Props = NativeStackScreenProps<RootStackParamList, "Reader">;

type BookRow = { id: string; title: string; local_path: string };

type RectPx = { x: number; y: number; w: number; h: number };

type TopicEditorState = {
  visible: boolean;
  mode: "add" | "rename";
  topicId: string | null;
  name: string;
};

const MIN_RECT_SIZE_PX = 8;

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

export default function ReaderScreen({ route, navigation }: Props) {
  const { bookId } = route.params;

  const pdfRef = useRef<any>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [book, setBook] = useState<BookRow | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const [highlightMode, setHighlightMode] = useState(false);
  const [penMode, setPenMode] = useState(false);
  const [revisionMode, setRevisionMode] = useState(false);

  const [notesVisible, setNotesVisible] = useState(false);
  const [topicsVisible, setTopicsVisible] = useState(false);

  const [notes, setNotes] = useState<ReaderNote[]>([]);
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [topics, setTopics] = useState<ReaderTopic[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);

  const [previewRect, setPreviewRect] = useState<RectPx | null>(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const [activeGlowHighlightId, setActiveGlowHighlightId] = useState<string | null>(null);

  const [miniToolbar, setMiniToolbar] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false,
    x: 0,
    y: 0,
  });

  const [highlightSheetVisible, setHighlightSheetVisible] = useState(false);
  const [linkedNoteId, setLinkedNoteId] = useState<string | null>(null);
  const [linkedNoteText, setLinkedNoteText] = useState("");

  const [pendingJumpHighlightId, setPendingJumpHighlightId] = useState<string | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const [topicEditor, setTopicEditor] = useState<TopicEditorState>({
    visible: false,
    mode: "add",
    topicId: null,
    name: "",
  });

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const source = useMemo(() => {
    if (!book) return null;
    const uri = book.local_path.startsWith("file://") ? book.local_path : `file://${book.local_path}`;
    return { uri };
  }, [book]);

  const selectedHighlight = useMemo(
    () => highlights.find((item) => item.id === selectedHighlightId) ?? null,
    [highlights, selectedHighlightId]
  );

  const visibleTopicMap = useMemo(() => {
    const map = new Map<string, boolean>();
    topics.forEach((topic) => map.set(topic.id, topic.is_visible === 1));
    return map;
  }, [topics]);

  const visibleHighlights = useMemo(() => {
    return highlights.filter((item) => {
      if (item.topic_id && visibleTopicMap.has(item.topic_id) && !visibleTopicMap.get(item.topic_id)) return false;
      if (revisionMode && item.color !== "yellow") return false;
      return true;
    });
  }, [highlights, revisionMode, visibleTopicMap]);

  const isBookmarked = useMemo(() => bookmarks.includes(page), [bookmarks, page]);

  const resetToolbarTimer = useCallback((ms = 3200) => {
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = setTimeout(() => {
      setMiniToolbar({ visible: false, x: 0, y: 0 });
    }, ms);
  }, []);

  const flashHighlight = useCallback((highlightId: string) => {
    setActiveGlowHighlightId(highlightId);
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    glowTimerRef.current = setTimeout(() => setActiveGlowHighlightId(null), 900);
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
          COALESCE(h.cnt, 0) AS highlightCount
        FROM topics t
        LEFT JOIN (
          SELECT topic_id, COUNT(*) AS cnt
          FROM highlights
          WHERE book_id = ?
          GROUP BY topic_id
        ) h ON h.topic_id = t.id
        WHERE t.book_id = ?
        ORDER BY t.created_at ASC`,
      [bookId, bookId]
    );

    if (!result[0].rows.length) {
      await ensureDefaultTopics();
      return loadTopics();
    }

    const next: ReaderTopic[] = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      const row = result[0].rows.item(i) as ReaderTopic;
      next.push({ ...row, highlightCount: Number((row as ReaderTopic & { highlightCount: number }).highlightCount) || 0 });
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

  const loadNotes = useCallback(async () => {
    const db = await getDB();
    const result = await db.executeSql(
      `SELECT n.id, n.page_number, n.content, n.updated_at, n.highlight_id,
          COALESCE(n.starred, 0) AS starred,
          COALESCE(n.note_kind, 'normal') AS note_kind
        FROM notes n
        WHERE n.book_id = ?
        ORDER BY n.page_number ASC, n.updated_at DESC`,
      [bookId]
    );

    const next: ReaderNote[] = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      const row = result[0].rows.item(i) as ReaderNote;
      const kind = row.note_kind === "important" || row.note_kind === "doubt" ? row.note_kind : "normal";
      next.push({ ...row, starred: Number(row.starred) || 0, note_kind: kind });
    }
    setNotes(next);
  }, [bookId]);

  const loadHighlightsForPage = useCallback(
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
      setHighlights(next);
    },
    [bookId]
  );

  useEffect(() => {
    loadBook().catch((e) => console.log("load book error", e));
    loadNotes().catch((e) => console.log("load notes error", e));
    loadTopics().catch((e) => console.log("load topics error", e));
    loadBookmarks().catch((e) => console.log("load bookmarks error", e));
  }, [loadBook, loadBookmarks, loadNotes, loadTopics]);

  useEffect(() => {
    loadHighlightsForPage(page).catch((e) => console.log("load highlights error", e));
  }, [loadHighlightsForPage, page]);

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

  const onPdfLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  const addPageNote = useCallback(
    async (content: string, kind: "normal" | "important" | "doubt") => {
      const db = await getDB();
      const now = Date.now();
      await db.executeSql(
        "INSERT INTO notes (id, book_id, page_number, content, highlight_id, note_kind, starred, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)",
        [uid(), bookId, page, content, kind, now, now]
      );
      await loadNotes();
    },
    [bookId, loadNotes, page]
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

  const toggleStarNote = useCallback(
    async (id: string, starred: number) => {
      const db = await getDB();
      const next = starred ? 0 : 1;
      await db.executeSql("UPDATE notes SET starred = ?, updated_at = ? WHERE id = ?", [next, Date.now(), id]);
      await loadNotes();
    },
    [loadNotes]
  );

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
    await loadBookmarks();
  }, [bookId, bookmarks, loadBookmarks, page]);

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

      await loadHighlightsForPage(page);
      await loadTopics();

      setSelectedHighlightId(id);
      flashHighlight(id);
      showMiniToolbarAt(rect.x + rect.w / 2, rect.y);
    },
    [activeTopicId, bookId, containerSize.height, containerSize.width, flashHighlight, loadHighlightsForPage, loadTopics, page, showMiniToolbarAt]
  );

  const finishDraw = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => {
      if (!containerSize.width || !containerSize.height) return;
      const rect = normalizeRectPx(startX, startY, endX, endY, containerSize.width, containerSize.height);
      saveHighlight(rect).catch((e) => console.log("save highlight error", e));
    },
    [containerSize.height, containerSize.width, saveHighlight]
  );

  const resetDrawPreview = useCallback(() => {
    drawStartRef.current = null;
    setPreviewRect(null);
  }, []);

  const onDrawGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (!highlightMode || penMode || !containerSize.width || !containerSize.height) return;
      const start = drawStartRef.current;
      if (!start) return;
      const currentX = clamp(event.nativeEvent.x, 0, containerSize.width);
      const currentY = clamp(event.nativeEvent.y, 0, containerSize.height);
      setPreviewRect(normalizeRectPx(start.x, start.y, currentX, currentY, containerSize.width, containerSize.height));
    },
    [containerSize.height, containerSize.width, highlightMode, penMode]
  );

  const onDrawHandlerStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      if (!highlightMode || penMode || !containerSize.width || !containerSize.height) return;
      const { state, x, y } = event.nativeEvent;
      const clampedX = clamp(x, 0, containerSize.width);
      const clampedY = clamp(y, 0, containerSize.height);

      if (state === State.BEGAN) {
        drawStartRef.current = { x: clampedX, y: clampedY };
        setPreviewRect({ x: clampedX, y: clampedY, w: 0, h: 0 });
        return;
      }

      if (state === State.ACTIVE) {
        const start = drawStartRef.current;
        if (!start) return;
        setPreviewRect(normalizeRectPx(start.x, start.y, clampedX, clampedY, containerSize.width, containerSize.height));
        return;
      }

      if (state === State.END) {
        const start = drawStartRef.current;
        if (!start) return;
        finishDraw(start.x, start.y, clampedX, clampedY);
        resetDrawPreview();
        return;
      }

      if (state === State.CANCELLED || state === State.FAILED) {
        resetDrawPreview();
      }
    },
    [containerSize.height, containerSize.width, finishDraw, highlightMode, penMode, resetDrawPreview]
  );

  const openHighlightActions = useCallback(
    async (highlight: HighlightRow) => {
      setSelectedHighlightId(highlight.id);
      flashHighlight(highlight.id);

      if (containerSize.width && containerSize.height) {
        showMiniToolbarAt(highlight.x * containerSize.width + (highlight.w * containerSize.width) / 2, highlight.y * containerSize.height);
      }

      const db = await getDB();
      const result = await db.executeSql("SELECT id, content FROM notes WHERE highlight_id = ? LIMIT 1", [highlight.id]);
      const row = result[0].rows.length ? (result[0].rows.item(0) as { id: string; content: string }) : null;
      setLinkedNoteId(row?.id ?? null);
      setLinkedNoteText(row?.content ?? "");
      setHighlightSheetVisible(true);
    },
    [containerSize.height, containerSize.width, flashHighlight, showMiniToolbarAt]
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
      await db.executeSql("UPDATE notes SET content = ?, note_kind = ?, updated_at = ? WHERE id = ?", [
        content,
        COLOR_TO_KIND[selectedHighlight.color],
        now,
        linkedNoteId,
      ]);
    } else {
      const noteId = uid();
      await db.executeSql(
        "INSERT INTO notes (id, book_id, page_number, content, highlight_id, note_kind, starred, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
        [noteId, bookId, selectedHighlight.page_number, content, selectedHighlight.id, COLOR_TO_KIND[selectedHighlight.color], now, now]
      );
      setLinkedNoteId(noteId);
    }

    await loadNotes();
  }, [bookId, linkedNoteId, linkedNoteText, loadNotes, selectedHighlight]);

  const updateHighlightColor = useCallback(
    async (color: HighlightColor) => {
      if (!selectedHighlightId) return;
      const db = await getDB();
      const now = Date.now();
      await db.executeSql("UPDATE highlights SET color = ?, updated_at = ? WHERE id = ?", [color, now, selectedHighlightId]);

      setHighlights((prev) => prev.map((item) => (item.id === selectedHighlightId ? { ...item, color, updated_at: now } : item)));
      if (linkedNoteId) {
        await db.executeSql("UPDATE notes SET note_kind = ?, updated_at = ? WHERE id = ?", [COLOR_TO_KIND[color], now, linkedNoteId]);
        await loadNotes();
      }
      resetToolbarTimer();
    },
    [linkedNoteId, loadNotes, resetToolbarTimer, selectedHighlightId]
  );

  const deleteSelectedHighlight = useCallback(async () => {
    if (!selectedHighlightId) return;
    const db = await getDB();
    await db.executeSql("DELETE FROM highlights WHERE id = ?", [selectedHighlightId]);
    await db.executeSql("DELETE FROM notes WHERE highlight_id = ?", [selectedHighlightId]);

    setSelectedHighlightId(null);
    setLinkedNoteId(null);
    setLinkedNoteText("");
    setHighlightSheetVisible(false);
    setMiniToolbar({ visible: false, x: 0, y: 0 });

    await loadHighlightsForPage(page);
    await loadNotes();
    await loadTopics();
  }, [loadHighlightsForPage, loadNotes, loadTopics, page, selectedHighlightId]);

  const onPressNote = useCallback(
    (note: ReaderNote) => {
      try {
        if (pdfRef.current && typeof (pdfRef.current as { setPage?: (pageNumber: number) => void }).setPage === "function") {
          (pdfRef.current as { setPage: (pageNumber: number) => void }).setPage(note.page_number);
        }
      } catch (e) {
        console.log("set page error", e);
      }

      setPage(note.page_number);
      if (note.highlight_id) {
        setPendingJumpHighlightId(note.highlight_id);
      }
      setNotesVisible(false);
    },
    []
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
    setTopicEditor({ visible: true, mode: "add", topicId: null, name: "" });
  }, []);

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
            }),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const db = await getDB();
            await db.executeSql("UPDATE highlights SET topic_id = NULL WHERE topic_id = ?", [topicId]);
            await db.executeSql("DELETE FROM topics WHERE id = ?", [topicId]);
            await loadTopics();
            await loadHighlightsForPage(page);
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [loadHighlightsForPage, loadTopics, page, topics]
  );

  const saveTopicEditor = useCallback(async () => {
    const name = topicEditor.name.trim();
    if (!name) return;

    const db = await getDB();
    const now = Date.now();

    if (topicEditor.mode === "add") {
      const color = TOPIC_PRESET[topics.length % TOPIC_PRESET.length]?.color ?? "#91a4b5";
      const topicId = uid();
      await db.executeSql(
        "INSERT INTO topics (id, book_id, name, color, is_visible, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
        [topicId, bookId, name, color, now, now]
      );
      setActiveTopicId(topicId);
    } else if (topicEditor.topicId) {
      await db.executeSql("UPDATE topics SET name = ?, updated_at = ? WHERE id = ?", [name, now, topicEditor.topicId]);
    }

    setTopicEditor({ visible: false, mode: "add", topicId: null, name: "" });
    await loadTopics();
  }, [bookId, loadTopics, topicEditor, topics.length]);

  if (!book || !source) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading reader...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <TopToolbar
        title={book.title}
        page={page}
        totalPages={totalPages}
        highlightMode={highlightMode}
        penMode={penMode}
        revisionMode={revisionMode}
        isBookmarked={isBookmarked}
        onPressBack={navigation.goBack}
        onToggleHighlight={() => {
          setHighlightMode((prev) => {
            const next = !prev;
            if (next) setPenMode(false);
            if (!next) resetDrawPreview();
            return next;
          });
        }}
        onTogglePen={() => {
          setPenMode((prev) => {
            const next = !prev;
            if (next) {
              setHighlightMode(false);
              resetDrawPreview();
            }
            return next;
          });
        }}
        onToggleBookmark={() => toggleBookmark().catch((e) => console.log("bookmark error", e))}
        onPressTopics={() => setTopicsVisible(true)}
        onToggleRevision={() => setRevisionMode((prev) => !prev)}
      />

      <View style={styles.readerArea} onLayout={onPdfLayout}>
        <Pdf
          ref={pdfRef}
          source={source}
          style={styles.pdf}
          onLoadComplete={(pages) => setTotalPages(pages)}
          onPageChanged={(nextPage) => setPage(nextPage)}
          onError={(e) => {
            console.log("PDF error:", e);
            Alert.alert("PDF Error", "Could not open this PDF on device.");
          }}
        />

        <HighlightLayer
          width={containerSize.width}
          height={containerSize.height}
          highlights={visibleHighlights}
          activeHighlightId={activeGlowHighlightId}
          disabled={highlightMode}
          onPressHighlight={(item) => openHighlightActions(item).catch((e) => console.log("open highlight error", e))}
        />

        {previewRect ? (
          <View
            pointerEvents="none"
            style={[
              styles.previewRect,
              { left: previewRect.x, top: previewRect.y, width: previewRect.w, height: previewRect.h },
            ]}
          />
        ) : null}

        <PanGestureHandler
          enabled={highlightMode && !penMode}
          onGestureEvent={onDrawGestureEvent}
          onHandlerStateChange={onDrawHandlerStateChange}
        >
          <View style={StyleSheet.absoluteFillObject} pointerEvents={highlightMode && !penMode ? "auto" : "none"} />
        </PanGestureHandler>

        <HighlightMiniToolbar
          visible={miniToolbar.visible && !!selectedHighlight}
          x={miniToolbar.x}
          y={miniToolbar.y}
          color={selectedHighlight?.color ?? "yellow"}
          onAddNote={() => {
            setHighlightSheetVisible(true);
            resetToolbarTimer();
          }}
          onChangeColor={(color) => updateHighlightColor(color).catch((e) => console.log("color update error", e))}
          onDelete={() => deleteSelectedHighlight().catch((e) => console.log("delete highlight error", e))}
        />

        <Pressable style={styles.notesFab} onPress={() => setNotesVisible(true)}>
          <Text style={styles.notesFabText}>Notes</Text>
        </Pressable>
      </View>

      <NotesBottomSheet
        visible={notesVisible}
        notes={notes}
        currentPage={page}
        revisionMode={revisionMode}
        onClose={() => setNotesVisible(false)}
        onAddNote={(content, kind) => addPageNote(content, kind).catch((e) => console.log("add note error", e))}
        onPressNote={onPressNote}
        onDeleteNote={(id) => deleteNote(id).catch((e) => console.log("delete note error", e))}
        onUpdateNote={(id, content) => updateNote(id, content).catch((e) => console.log("update note error", e))}
        onToggleStar={(id, starred) => toggleStarNote(id, starred).catch((e) => console.log("toggle star error", e))}
      />

      <TopicsDrawer
        visible={topicsVisible}
        topics={topics}
        activeTopicId={activeTopicId}
        onClose={() => setTopicsVisible(false)}
        onSelectTopic={setActiveTopicId}
        onToggleVisibility={(topicId, nextVisible) =>
          toggleTopicVisibility(topicId, nextVisible).catch((e) => console.log("topic visibility error", e))
        }
        onAddTopic={addTopic}
        onLongPressTopic={renameOrDeleteTopic}
      />

      <Modal visible={highlightSheetVisible} transparent animationType="fade" onRequestClose={() => setHighlightSheetVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHighlightSheetVisible(false)} />
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>Highlight Actions</Text>

            <TextInput
              value={linkedNoteText}
              onChangeText={setLinkedNoteText}
              placeholder="Add or edit linked note"
              multiline
              style={styles.sheetInput}
            />

            <Pressable style={styles.sheetPrimaryBtn} onPress={() => saveLinkedNote().catch((e) => console.log("save linked note error", e))}>
              <Text style={styles.sheetPrimaryBtnText}>Save Note</Text>
            </Pressable>

            <View style={styles.colorLegendRow}>
              {(Object.keys(COLOR_LABELS) as HighlightColor[]).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => updateHighlightColor(item).catch((e) => console.log("highlight color error", e))}
                  style={[
                    styles.legendChip,
                    selectedHighlight?.color === item ? styles.legendChipActive : null,
                    { borderColor: item === "yellow" ? "#e6c447" : item === "green" ? "#43b874" : item === "blue" ? "#4a8fdf" : "#dd69af" },
                  ]}
                >
                  <Text style={styles.legendChipText}>{COLOR_LABELS[item]}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.sheetDangerBtn} onPress={() => deleteSelectedHighlight().catch((e) => console.log("delete error", e))}>
              <Text style={styles.sheetDangerBtnText}>Delete Highlight</Text>
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
            <View style={styles.topicEditorActions}>
              <Pressable
                style={styles.topicEditorButton}
                onPress={() => setTopicEditor({ visible: false, mode: "add", topicId: null, name: "" })}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f6fb",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f6f9fc",
  },
  loadingText: {
    color: "#405262",
    fontWeight: "700",
  },
  readerArea: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  pdf: {
    flex: 1,
    backgroundColor: "#eff3f8",
  },
  previewRect: {
    position: "absolute",
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#2f77e6",
    backgroundColor: "rgba(76, 141, 241, 0.2)",
  },
  notesFab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    minWidth: 96,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#1f6fde",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0a2540",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  notesFabText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
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
    color: "#102131",
  },
  topicEditorInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#d1dce5",
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  topicEditorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  topicEditorButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1dce5",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  topicEditorButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2f4354",
  },
  topicEditorPrimary: {
    backgroundColor: "#1f6fde",
    borderColor: "#1f6fde",
  },
  topicEditorPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
});
