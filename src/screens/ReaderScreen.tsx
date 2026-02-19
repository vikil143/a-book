import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Modal, TextInput, FlatList, Alert } from "react-native";
import Pdf from "react-native-pdf";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getDB } from "../db";
import { uid } from "../utils/files";

type Props = NativeStackScreenProps<RootStackParamList, "Reader">;

type BookRow = { id: string; title: string; local_path: string };
type NoteRow = { id: string; page_number: number; content: string; updated_at: number };

export default function ReaderScreen({ route, navigation }: Props) {
  const { bookId } = route.params;

  const [book, setBook] = useState<BookRow | null>(null);
  const [page, setPage] = useState<number>(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState<NoteRow[]>([]);

  const source = useMemo(() => {
    if (!book) return null;
    // RN PDF expects file:// on Android sometimes
    const uri = book.local_path.startsWith("file://") ? book.local_path : `file://${book.local_path}`;
    return { uri };
  }, [book]);

  useEffect(() => {
    (async () => {
      const db = await getDB();
      const res = await db.executeSql("SELECT id, title, local_path FROM books WHERE id = ?", [bookId]);
      const row = res[0].rows.length ? res[0].rows.item(0) : null;
      setBook(row);
      if (row?.title) navigation.setOptions({ title: row.title });
    })();
  }, [bookId, navigation]);

  const loadNotes = async () => {
    const db = await getDB();
    const res = await db.executeSql(
      "SELECT id, page_number, content, updated_at FROM notes WHERE book_id = ? ORDER BY updated_at DESC",
      [bookId]
    );
    const rows = res[0].rows;
    const list: NoteRow[] = [];
    for (let i = 0; i < rows.length; i++) list.push(rows.item(i));
    setNotes(list);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    loadNotes().catch(console.log);
  }, [drawerOpen]);

  const addNoteForCurrentPage = async () => {
    const content = noteText.trim();
    if (!content) return;

    const db = await getDB();
    const now = Date.now();
    await db.executeSql(
      "INSERT INTO notes (id, book_id, page_number, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [uid(), bookId, page, content, now, now]
    );

    setNoteText("");
    await loadNotes();
  };

  const deleteNote = async (id: string) => {
    const db = await getDB();
    await db.executeSql("DELETE FROM notes WHERE id = ?", [id]);
    await loadNotes();
  };

  if (!book || !source) return <View style={styles.container}><Text>Loading…</Text></View>;

  return (
    <View style={styles.container}>
      <Pdf
        source={source}
        style={styles.pdf}
        onPageChanged={(p) => setPage(p)}
        onError={(e) => {
          console.log("PDF error:", e);
          Alert.alert("PDF Error", "Could not open this PDF on device.");
        }}
      />

      {/* Floating Notes button */}
      <TouchableOpacity style={styles.fab} onPress={() => setDrawerOpen(true)}>
        <Text style={styles.fabText}>Notes</Text>
      </TouchableOpacity>

      {/* Notes Drawer (Modal Bottom Sheet) */}
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
                placeholder="Write a note for current page…"
                style={styles.input}
                multiline
              />
              <TouchableOpacity style={styles.addBtn} onPress={addNoteForCurrentPage}>
                <Text style={{ fontWeight: "700" }}>Add</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={notes}
              keyExtractor={(n) => n.id}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <View style={styles.noteCard}>
                  <Text style={styles.noteMeta}>Page {item.page_number}</Text>
                  <Text style={styles.noteText}>{item.content}</Text>
                  <TouchableOpacity onPress={() => deleteNote(item.id)} style={styles.deleteBtn}>
                    <Text style={{ color: "#a00", fontWeight: "700" }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={{ color: "#666", marginTop: 12 }}>No notes yet.</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  pdf: { flex: 1 },

  fab: {
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
  fabText: { fontWeight: "800" },

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

  noteCard: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 12 },
  noteMeta: { fontSize: 12, color: "#666" },
  noteText: { marginTop: 6, fontSize: 14 },
  deleteBtn: { marginTop: 10, alignSelf: "flex-start" },
});
