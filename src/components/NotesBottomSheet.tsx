import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type NotesFilter = "all" | "page" | "linked";
export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export type ReaderNote = {
  id: string;
  page_number: number;
  content: string;
  updated_at: number;
  highlight_id: string | null;
  highlight_color?: HighlightColor | null;
  topic_id?: string | null;
  starred: number;
  note_kind: "normal" | "important" | "doubt";
};

type Props = {
  visible: boolean;
  notes: ReaderNote[];
  currentPage: number;
  onClose: () => void;
  onAddNote: (content: string, kind: "normal" | "important" | "doubt") => void;
  onPressNote: (note: ReaderNote) => void;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, content: string) => void;
};

const FILTERS: { key: NotesFilter; label: string }[] = [
  { key: "page", label: "Current Page" },
  { key: "linked", label: "Linked Notes" },
  { key: "all", label: "All Notes" },
];

const SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.75);

function getLinkedBadgeStyles(color?: HighlightColor | null) {
  if (color === "green") {
    return { borderColor: "#2f9f63", backgroundColor: "#e7f8ef" };
  }
  if (color === "blue") {
    return { borderColor: "#3577c2", backgroundColor: "#eaf4ff" };
  }
  if (color === "pink") {
    return { borderColor: "#bf538e", backgroundColor: "#ffeef7" };
  }
  return { borderColor: "#b89c39", backgroundColor: "#fff8df" };
}

function NotesBottomSheet({
  visible,
  notes,
  currentPage,
  onClose,
  onAddNote,
  onPressNote,
  onDeleteNote,
  onUpdateNote,
}: Props) {
  const [mounted, setMounted] = useState(visible);
  const [draft, setDraft] = useState("");
  const [newNoteKind, setNewNoteKind] = useState<"normal" | "important" | "doubt">("normal");
  const [filter, setFilter] = useState<NotesFilter>("page");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [collapsedPages, setCollapsedPages] = useState<Record<number, boolean>>({});

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setFilter("page");
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 170, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [backdropOpacity, translateY, visible]);

  useEffect(() => {
    if (!visible) return;
    setFilter("page");
  }, [currentPage, visible]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 140 || gesture.vy > 1.2) {
            onClose();
            return;
          }
          Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true }).start();
        },
      }),
    [onClose, translateY]
  );

  const groupedNotes = useMemo(() => {
    const filtered = notes.filter((item) => {
      if (filter === "all") return true;
      if (filter === "page") return item.page_number === currentPage;
      return item.page_number === currentPage && !!item.highlight_id;
    });

    const groups = new Map<number, ReaderNote[]>();
    filtered.forEach((item) => {
      const bucket = groups.get(item.page_number) ?? [];
      bucket.push(item);
      groups.set(item.page_number, bucket);
    });

    return Array.from(groups.entries())
      .sort((a, b) => {
        if (a[0] === currentPage) return -1;
        if (b[0] === currentPage) return 1;
        return a[0] - b[0];
      })
      .map(([page, pageNotes]) => ({
        page,
        notes: pageNotes.sort((a, b) => b.updated_at - a.updated_at),
      }));
  }, [currentPage, filter, notes]);

  if (!mounted) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}> 
        <View style={styles.dragHandleWrap} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        <View style={styles.headerRow}>
          <Text style={styles.title}>Notes</Text>
          <Text style={styles.pageCaption}>Page {currentPage}</Text>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((chip) => {
            const active = chip.key === filter;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                style={[styles.filterChip, active ? styles.filterChipActive : null]}
              >
                <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.inputCard}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a note..."
            multiline
            style={styles.input}
          />
          <View style={styles.noteTypeRow}>
            <Pressable
              onPress={() => setNewNoteKind("normal")}
              style={[styles.kindChip, newNoteKind === "normal" ? styles.kindChipActive : null]}
            >
              <Text style={styles.kindText}>Normal</Text>
            </Pressable>
            <Pressable
              onPress={() => setNewNoteKind("important")}
              style={[styles.kindChip, newNoteKind === "important" ? styles.kindChipActive : null]}
            >
              <Text style={styles.kindText}>Important</Text>
            </Pressable>
            <Pressable
              onPress={() => setNewNoteKind("doubt")}
              style={[styles.kindChip, newNoteKind === "doubt" ? styles.kindChipActive : null]}
            >
              <Text style={styles.kindText}>Doubt</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const content = draft.trim();
                if (!content) return;
                onAddNote(content, newNoteKind);
                setDraft("");
              }}
              style={styles.addButton}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {groupedNotes.length ? (
            groupedNotes.map((group) => {
              const collapsed = collapsedPages[group.page] ?? false;
              return (
                <View key={`page-${group.page}`} style={styles.group}>
                  <Pressable
                    onPress={() => setCollapsedPages((prev) => ({ ...prev, [group.page]: !collapsed }))}
                    style={styles.groupHeader}
                  >
                    <Text style={styles.groupTitle}>Page {group.page}</Text>
                    <Text style={styles.groupMeta}>{collapsed ? "Show" : `${group.notes.length} notes`}</Text>
                  </Pressable>

                  {!collapsed
                    ? group.notes.map((item) => {
                        const isEditing = editingId === item.id;
                        return (
                          <Pressable key={item.id} style={styles.noteCard} onPress={() => onPressNote(item)}>
                            <View style={styles.noteTopRow}>
                              {item.highlight_id ? (
                                <View style={[styles.linkedBadge, getLinkedBadgeStyles(item.highlight_color)]}>
                                  <Text style={styles.linkedBadgeText}>LINKED</Text>
                                </View>
                              ) : (
                                <Text style={styles.noteTag}>PAGE NOTE</Text>
                              )}
                            </View>

                            {isEditing ? (
                              <TextInput
                                value={editingText}
                                onChangeText={setEditingText}
                                multiline
                                style={styles.editInput}
                              />
                            ) : (
                              <Text style={styles.noteText}>{item.content}</Text>
                            )}

                            <View style={styles.noteActions}>
                              {isEditing ? (
                                <>
                                  <Pressable
                                    onPress={() => {
                                      const next = editingText.trim();
                                      if (!next) return;
                                      onUpdateNote(item.id, next);
                                      setEditingId(null);
                                      setEditingText("");
                                    }}
                                    style={styles.noteActionChip}
                                  >
                                    <Text style={styles.noteActionText}>Save</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => {
                                      setEditingId(null);
                                      setEditingText("");
                                    }}
                                    style={styles.noteActionChip}
                                  >
                                    <Text style={styles.noteActionText}>Cancel</Text>
                                  </Pressable>
                                </>
                              ) : (
                                <Pressable
                                  onPress={() => {
                                    setEditingId(item.id);
                                    setEditingText(item.content);
                                  }}
                                  style={styles.noteActionChip}
                                >
                                  <Text style={styles.noteActionText}>Edit</Text>
                                </Pressable>
                              )}

                              <Pressable onPress={() => onDeleteNote(item.id)} style={styles.noteActionChipDanger}>
                                <Text style={styles.noteActionDangerText}>Delete</Text>
                              </Pressable>
                            </View>
                          </Pressable>
                        );
                      })
                    : null}
                </View>
              );
            })
          ) : (
            <Text style={styles.empty}>No notes found for selected filter.</Text>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 12, 9, 0.22)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    backgroundColor: "#fffdf9",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingBottom: 18,
    shadowColor: "#3c2f25",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  dragHandleWrap: {
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  dragHandle: {
    width: 48,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#d8cdc1",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f1a16",
  },
  pageCaption: {
    fontSize: 13,
    color: "#786b5f",
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5dacc",
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: "#fbf7f1",
  },
  filterChipActive: {
    borderColor: "#d3c1ad",
    backgroundColor: "#f1e7da",
  },
  filterText: {
    fontSize: 12,
    color: "#4c4034",
    fontWeight: "700",
  },
  filterTextActive: {
    color: "#241d18",
  },
  inputCard: {
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#fff7ee",
  },
  input: {
    minHeight: 64,
    maxHeight: 96,
    fontSize: 15,
    color: "#1f1a16",
    textAlignVertical: "top",
  },
  noteTypeRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kindChip: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e0d2c2",
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "#fffdf9",
  },
  kindChipActive: {
    borderColor: "#d4b792",
    backgroundColor: "#f2e6d8",
  },
  kindText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#483d33",
  },
  addButton: {
    marginLeft: "auto",
    minHeight: 38,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "#221e1a",
    justifyContent: "center",
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
    gap: 16,
  },
  group: {
    gap: 8,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#241e19",
  },
  groupMeta: {
    fontSize: 12,
    color: "#7c6f62",
    fontWeight: "600",
  },
  noteCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 10,
    shadowColor: "#6b5d4f",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  noteTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noteTag: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: "#8b7c6d",
  },
  linkedBadge: {
    minHeight: 24,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  linkedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#433a32",
  },
  noteText: {
    fontSize: 15,
    color: "#211b17",
    lineHeight: 22,
  },
  editInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: "#e3d7ca",
    borderRadius: 14,
    padding: 10,
    textAlignVertical: "top",
  },
  noteActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noteActionChip: {
    minHeight: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3d7ca",
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  noteActionChipDanger: {
    minHeight: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#efc6cb",
    paddingHorizontal: 10,
    justifyContent: "center",
    marginLeft: "auto",
  },
  noteActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#483d33",
  },
  noteActionDangerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ac2130",
  },
  empty: {
    marginTop: 16,
    textAlign: "center",
    color: "#647587",
    fontSize: 14,
  },
});

export default React.memo(NotesBottomSheet);
