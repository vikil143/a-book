import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Button, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { pick, types, isCancel } from "@react-native-documents/picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getDB } from "../db";
import { savePdfToAppStorage, uid } from "../utils/files";

type Props = NativeStackScreenProps<RootStackParamList, "Library">;

type BookRow = { id: string; title: string; local_path: string; created_at: number };

export default function LibraryScreen({ navigation }: Props) {
  const [books, setBooks] = useState<BookRow[]>([]);

  const loadBooks = useCallback(async () => {
    const db = await getDB();
    const res = await db.executeSql("SELECT * FROM books ORDER BY created_at DESC");
    const rows = res[0].rows;
    const list: BookRow[] = [];
    for (let i = 0; i < rows.length; i++) list.push(rows.item(i));
    setBooks(list);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => loadBooks());
    loadBooks();
    return unsub;
  }, [navigation, loadBooks]);

  const pickPdf = async () => {
    try {
      const res = await pick({
        type: [types.pdf],
        copyTo: "cachesDirectory", // helps iOS + some Android cases
      });
      const file = Array.isArray(res) ? res[0] : res;
      if (!file) return;

      const fileUri = file.fileCopyUri || file.uri; // prefer copied uri when available
      const localPath = await savePdfToAppStorage(fileUri);

      const bookId = uid();
      const title = (file.name || "Untitled").replace(/\.pdf$/i, "");

      const db = await getDB();
      await db.executeSql(
        "INSERT INTO books (id, title, local_path, created_at) VALUES (?, ?, ?, ?)",
        [bookId, title, localPath, Date.now()]
      );

      await loadBooks();
      navigation.navigate("Reader", { bookId });
    } catch (e: any) {
      if (isCancel(e)) return;
      console.log("Pick error:", e);
      Alert.alert("Error", "Failed to import PDF.");
    }
  };

  return (
    <View style={styles.container}>
      <Button title="Import PDF" onPress={pickPdf} />

      <Text style={styles.h2}>Your Books</Text>

      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("Reader", { bookId: item.id })}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{item.local_path}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ color: "#666", marginTop: 12 }}>No PDFs yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  h2: { marginTop: 14, fontWeight: "700", fontSize: 16 },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 12 },
  title: { fontWeight: "700" },
  meta: { marginTop: 6, fontSize: 12, color: "#666" },
});
