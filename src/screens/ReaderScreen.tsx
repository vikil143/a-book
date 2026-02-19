import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Pdf from "react-native-pdf";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getDB } from "../db";
import { uid } from "../utils/files";
import HighlightLayer, { type HighlightColor, type HighlightRow } from "./components/HighlightLayer";
import HighlightActionsModal from "./components/HighlightActionsModal";

type Props = NativeStackScreenProps<RootStackParamList, "Reader">;

type BookRow = { id: string; title: string; local_path: string };
type NoteRow = {
  id: string;
  page_number: number;
  content: string;
  updated_at: number;
  highlight_id: string | null;
};

type Point = { x: number; y: number };
type RectPx = { x: number; y: number; w: number; h: number };

const MIN_RECT_SIZE_PX = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRect(start: Point, end: Point, containerWidth: number, containerHeight: number): RectPx {
  const sx = clamp(start.x, 0, containerWidth);
  const sy = clamp(start.y, 0, containerHeight);
  const ex = clamp(end.x, 0, containerWidth);
  const ey = clamp(end.y, 0, containerHeight);

  const x = Math.min(sx, ex);
  const y = Math.min(sy, ey);
  const w = Math.abs(ex - sx);
  const h = Math.abs(ey - sy);

  return { x, y, w, h };
}

function toHighlightColor(value: string): HighlightColor {
  if (value === "green" || value === "pink") return value;
  return "yellow";
}

export default function ReaderScreen({ route, navigation }: Props) {
  const { bookId } = route.params;

  const [book, setBook] = useState<BookRow | null>(null);
  const [page, setPage] = useState<number>(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState<NoteRow[]>([]);

  const [highlightMode, setHighlightMode] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [previewRect, setPreviewRect] = useState<RectPx | null>(null);
  const dragStartRef = useRef<Point | null>(null);

  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [selectedHighlight, setSelectedHighlight] = useState<HighlightRow | null>(null);
  const [linkedNoteId, setLinkedNoteId] = useState<string | null>(null);
  const [linkedNoteText, setLinkedNoteText] = useState("");

  const source = useMemo(() => {
    if (!book) return null;
    const uri = book.local_path.startsWith("file://") ? book.local_path : `file://${book.local_path}`;
    return { uri };
  }, [book]);

  useEffect(() => {
    (async () => {
      const db = await getDB();
      const res = await db.executeSql("SELECT id, title, local_path FROM books WHERE id = ?", [bookId]);
      const row = res[0].rows.length ? (res[0].rows.item(0) as BookRow) : null;
      setBook(row);
      if (row?.title) navigation.setOptions({ title: row.title });
    })().catch((e) => console.log("load book error", e));
  }, [bookId, navigation]);

  const loadNotes = useCallback(async () => {
    const db = await getDB();
    const res = await db.executeSql(
      "SELECT id, page_number, content, updated_at, highlight_id FROM notes WHERE book_id = ? ORDER BY updated_at DESC",
      [bookId]
    );
    const rows = res[0].rows;
    const list: NoteRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows.item(i) as NoteRow;
      list.push(row);
    }
    setNotes(list);
  }, [bookId]);

  const loadHighlightsForPage = useCallback(
    async (pageNumber: number) => {
      const db = await getDB();
      const res = await db.executeSql(
        "SELECT id, book_id, page_number, x, y, w, h, color, created_at, updated_at FROM highlights WHERE book_id = ? AND page_number = ? ORDER BY created_at ASC",
        [bookId, pageNumber]
      );

      const rows = res[0].rows;
      const list: HighlightRow[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows.item(i) as HighlightRow;
        list.push({
          ...row,
          color: toHighlightColor(row.color),
        });
      }
      setHighlights(list);
    },
    [bookId]
  );

  useEffect(() => {
    if (!drawerOpen) return;
    loadNotes().catch(console.log);
  }, [drawerOpen, loadNotes]);

  useEffect(() => {
    loadHighlightsForPage(page).catch(console.log);
    setSelectedHighlight((prev) => {
      if (!prev) return null;
      if (prev.page_number !== page) return null;
      return prev;
    });
  }, [loadHighlightsForPage, page]);

  const addNoteForCurrentPage = async () => {
    const content = noteText.trim();
    if (!content) return;

    const db = await getDB();
    const now = Date.now();
    await db.executeSql(
      "INSERT INTO notes (id, book_id, page_number, content, highlight_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uid(), bookId, page, content, null, now, now]
    );

    setNoteText("");
    await loadNotes();
  };

  const deleteNote = async (id: string) => {
    const db = await getDB();
    await db.executeSql("DELETE FROM notes WHERE id = ?", [id]);
    await loadNotes();
  };

  const saveHighlight = useCallback(
    async (rect: RectPx) => {
      if (!containerSize.width || !containerSize.height) return;
      if (rect.w < MIN_RECT_SIZE_PX || rect.h < MIN_RECT_SIZE_PX) return;

      const x = clamp(rect.x / containerSize.width, 0, 1);
      const y = clamp(rect.y / containerSize.height, 0, 1);
      const w = clamp(rect.w / containerSize.width, 0, 1);
      const h = clamp(rect.h / containerSize.height, 0, 1);

      const now = Date.now();
      const db = await getDB();

      await db.executeSql(
        "INSERT INTO highlights (id, book_id, page_number, x, y, w, h, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [uid(), bookId, page, x, y, w, h, "yellow", now, now]
      );

      await loadHighlightsForPage(page);
    },
    [bookId, containerSize.height, containerSize.width, loadHighlightsForPage, page]
  );

  const finishDrawing = useCallback(
    (endPoint: Point) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;

      if (!start || !containerSize.width || !containerSize.height) {
        setPreviewRect(null);
        return;
      }

      const rect = normalizeRect(start, endPoint, containerSize.width, containerSize.height);
      setPreviewRect(null);
      saveHighlight(rect).catch((e) => console.log("save highlight error", e));
    },
    [containerSize.height, containerSize.width, saveHighlight]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => highlightMode,
        onMoveShouldSetPanResponder: () => highlightMode,
        onPanResponderGrant: (evt) => {
          if (!highlightMode) return;
          const start = {
            x: clamp(evt.nativeEvent.locationX, 0, containerSize.width),
            y: clamp(evt.nativeEvent.locationY, 0, containerSize.height),
          };
          dragStartRef.current = start;
          setPreviewRect({ x: start.x, y: start.y, w: 0, h: 0 });
        },
        onPanResponderMove: (evt) => {
          const start = dragStartRef.current;
          if (!highlightMode || !start) return;

          const current = {
            x: clamp(evt.nativeEvent.locationX, 0, containerSize.width),
            y: clamp(evt.nativeEvent.locationY, 0, containerSize.height),
          };

          const rect = normalizeRect(start, current, containerSize.width, containerSize.height);
          setPreviewRect(rect);
        },
        onPanResponderRelease: (evt) => {
          if (!highlightMode) return;
          finishDrawing({
            x: clamp(evt.nativeEvent.locationX, 0, containerSize.width),
            y: clamp(evt.nativeEvent.locationY, 0, containerSize.height),
          });
        },
        onPanResponderTerminate: (evt) => {
          if (!highlightMode) return;
          finishDrawing({
            x: clamp(evt.nativeEvent.locationX, 0, containerSize.width),
            y: clamp(evt.nativeEvent.locationY, 0, containerSize.height),
          });
        },
      }),
    [containerSize.height, containerSize.width, finishDrawing, highlightMode]
  );

  const loadLinkedNote = useCallback(async (highlightId: string) => {
    const db = await getDB();
    const res = await db.executeSql("SELECT id, content FROM notes WHERE highlight_id = ? LIMIT 1", [highlightId]);
    const row = res[0].rows.length ? (res[0].rows.item(0) as { id: string; content: string }) : null;

    setLinkedNoteId(row?.id ?? null);
    setLinkedNoteText(row?.content ?? "");
  }, []);

  const openHighlightActions = useCallback(
    (highlight: HighlightRow) => {
      setSelectedHighlight(highlight);
      loadLinkedNote(highlight.id).catch((e) => console.log("load linked note error", e));
    },
    [loadLinkedNote]
  );

  const closeHighlightActions = useCallback(() => {
    setSelectedHighlight(null);
    setLinkedNoteId(null);
    setLinkedNoteText("");
  }, []);

  const saveLinkedNote = useCallback(async () => {
    if (!selectedHighlight) return;

    const content = linkedNoteText.trim();
    const now = Date.now();
    const db = await getDB();

    if (!content) {
      if (linkedNoteId) {
        await db.executeSql("DELETE FROM notes WHERE id = ?", [linkedNoteId]);
        setLinkedNoteId(null);
        if (drawerOpen) await loadNotes();
      }
      return;
    }

    if (linkedNoteId) {
      await db.executeSql(
        "UPDATE notes SET content = ?, page_number = ?, updated_at = ? WHERE id = ?",
        [content, selectedHighlight.page_number, now, linkedNoteId]
      );
    } else {
      const newId = uid();
      await db.executeSql(
        "INSERT INTO notes (id, book_id, page_number, content, highlight_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [newId, bookId, selectedHighlight.page_number, content, selectedHighlight.id, now, now]
      );
      setLinkedNoteId(newId);
    }

    if (drawerOpen) await loadNotes();
  }, [bookId, drawerOpen, linkedNoteId, linkedNoteText, loadNotes, selectedHighlight]);

  const deleteHighlight = useCallback(async () => {
    if (!selectedHighlight) return;

    const db = await getDB();
    await db.executeSql("DELETE FROM highlights WHERE id = ?", [selectedHighlight.id]);
    await db.executeSql("DELETE FROM notes WHERE highlight_id = ?", [selectedHighlight.id]);

    closeHighlightActions();
    await loadHighlightsForPage(page);
    if (drawerOpen) await loadNotes();
  }, [closeHighlightActions, drawerOpen, loadHighlightsForPage, loadNotes, page, selectedHighlight]);

  const updateHighlightColor = useCallback(
    async (color: HighlightColor) => {
      if (!selectedHighlight) return;

      const now = Date.now();
      const db = await getDB();
      await db.executeSql("UPDATE highlights SET color = ?, updated_at = ? WHERE id = ?", [color, now, selectedHighlight.id]);

      setHighlights((prev) => prev.map((item) => (item.id === selectedHighlight.id ? { ...item, color, updated_at: now } : item)));
      setSelectedHighlight((prev) => (prev ? { ...prev, color, updated_at: now } : prev));
    },
    [selectedHighlight]
  );

  const onPdfLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  if (!book || !source) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pdfContainer} onLayout={onPdfLayout}>
        <Pdf
          source={source}
          style={styles.pdf}
          onPageChanged={(p) => setPage(p)}
          onError={(e) => {
            console.log("PDF error:", e);
            Alert.alert("PDF Error", "Could not open this PDF on device.");
          }}
        />

        <HighlightLayer
          width={containerSize.width}
          height={containerSize.height}
          highlights={highlights}
          disabled={highlightMode}
          onPressHighlight={openHighlightActions}
        />

        {previewRect ? (
          <View
            pointerEvents="none"
            style={[
              styles.previewRect,
              {
                left: previewRect.x,
                top: previewRect.y,
                width: previewRect.w,
                height: previewRect.h,
              },
            ]}
          />
        ) : null}

        <View
          style={StyleSheet.absoluteFillObject}
          pointerEvents={highlightMode ? "auto" : "none"}
          {...panResponder.panHandlers}
        />
      </View>

      <TouchableOpacity
        style={[styles.modeFab, highlightMode ? styles.modeFabOn : null]}
        onPress={() => {
          setHighlightMode((prev) => !prev);
          setPreviewRect(null);
          dragStartRef.current = null;
        }}
      >
        <Text style={[styles.modeFabText, highlightMode ? styles.modeFabTextOn : null]}>
          Highlight {highlightMode ? "ON" : "OFF"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.notesFab} onPress={() => setDrawerOpen(true)}>
        <Text style={styles.notesFabText}>Notes</Text>
      </TouchableOpacity>

      <Modal visible={drawerOpen} animationType="slide" transparent onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Notes • Page {page}</Text>
              <TouchableOpacity onPress={() => setDrawerOpen(false)}>
                <Text style={styles.close}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.noteInputRow}>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Write a note for current page..."
                style={styles.input}
                multiline
              />
              <TouchableOpacity style={styles.addBtn} onPress={addNoteForCurrentPage}>
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={notes}
              keyExtractor={(n) => n.id}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <View style={styles.noteCard}>
                  <Text style={styles.noteMeta}>
                    Page {item.page_number}
                    {item.highlight_id ? " • linked" : ""}
                  </Text>
                  <Text style={styles.noteText}>{item.content}</Text>
                  <TouchableOpacity onPress={() => deleteNote(item.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyStateText}>No notes yet.</Text>}
            />
          </View>
        </View>
      </Modal>

      <HighlightActionsModal
        visible={!!selectedHighlight}
        pageNumber={selectedHighlight?.page_number ?? page}
        color={selectedHighlight?.color ?? "yellow"}
        noteText={linkedNoteText}
        onChangeNoteText={setLinkedNoteText}
        onSaveNote={() => saveLinkedNote().catch((e) => console.log("save linked note error", e))}
        onDeleteHighlight={() => deleteHighlight().catch((e) => console.log("delete highlight error", e))}
        onChangeColor={(color) => updateHighlightColor(color).catch((e) => console.log("update highlight color error", e))}
        onClose={closeHighlightActions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  pdfContainer: { flex: 1 },
  pdf: { flex: 1 },

  previewRect: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(32, 32, 32, 0.55)",
    backgroundColor: "rgba(255, 220, 0, 0.22)",
    borderRadius: 4,
  },

  modeFab: {
    position: "absolute",
    left: 16,
    bottom: 24,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#111",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  modeFabOn: {
    backgroundColor: "#ffd000",
    borderColor: "#d1ac00",
  },
  modeFabText: {
    color: "white",
    fontWeight: "800",
  },
  modeFabTextOn: {
    color: "#111",
  },

  notesFab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  notesFabText: { fontWeight: "800" },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.25)" },
  sheet: {
    height: "78%",
    backgroundColor: "white",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 12,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  sheetTitle: { fontSize: 16, fontWeight: "800", flex: 1 },
  close: { fontWeight: "800" },

  noteInputRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 10, minHeight: 44 },
  addBtn: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, paddingHorizontal: 14, justifyContent: "center" },
  addBtnText: { fontWeight: "700" },

  noteCard: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 12 },
  noteMeta: { fontSize: 12, color: "#666" },
  noteText: { marginTop: 6, fontSize: 14 },
  deleteBtn: { marginTop: 10, alignSelf: "flex-start" },
  deleteBtnText: { color: "#a00", fontWeight: "700" },
  emptyStateText: { color: "#666", marginTop: 12 },
});
