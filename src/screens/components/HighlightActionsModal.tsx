import React from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { HighlightColor } from "./HighlightLayer";

type Props = {
  visible: boolean;
  pageNumber: number;
  color: HighlightColor;
  noteText: string;
  onChangeNoteText: (value: string) => void;
  onSaveNote: () => void;
  onDeleteHighlight: () => void;
  onChangeColor: (color: HighlightColor) => void;
  onClose: () => void;
};

const COLORS: HighlightColor[] = ["yellow", "green", "pink"];

const COLOR_SWATCH_MAP: Record<HighlightColor, string> = {
  yellow: "#ffd000",
  green: "#50dc78",
  pink: "#ff69b4",
};

export default function HighlightActionsModal({
  visible,
  pageNumber,
  color,
  noteText,
  onChangeNoteText,
  onSaveNote,
  onDeleteHighlight,
  onChangeColor,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Highlight • Page {pageNumber}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Add/Edit linked note</Text>
          <TextInput
            value={noteText}
            onChangeText={onChangeNoteText}
            placeholder="Write a note for this highlight..."
            multiline
            style={styles.input}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={onSaveNote}>
            <Text style={styles.primaryButtonText}>Save Note</Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Change color</Text>
          <View style={styles.colorRow}>
            {COLORS.map((item) => {
              const selected = item === color;
              return (
                <TouchableOpacity
                  key={item}
                  onPress={() => onChangeColor(item)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: COLOR_SWATCH_MAP[item] },
                    selected ? styles.colorSwatchSelected : null,
                  ]}
                />
              );
            })}
          </View>

          <TouchableOpacity style={styles.deleteButton} onPress={onDeleteHighlight}>
            <Text style={styles.deleteText}>Delete Highlight</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  sheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  close: {
    fontWeight: "800",
  },
  sectionLabel: {
    marginTop: 4,
    fontWeight: "700",
    color: "#222",
  },
  input: {
    minHeight: 84,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 10,
    textAlignVertical: "top",
  },
  primaryButton: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    fontWeight: "700",
  },
  colorRow: {
    flexDirection: "row",
    gap: 10,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#999",
  },
  colorSwatchSelected: {
    borderColor: "#111",
    borderWidth: 2,
  },
  deleteButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#d66",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 10,
  },
  deleteText: {
    color: "#b00020",
    fontWeight: "700",
  },
});
