import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

type Props = {
  visible: boolean;
  x: number;
  y: number;
  color: HighlightColor;
  onAddNote: () => void;
  onChangeColor: (color: HighlightColor) => void;
  onDelete: () => void;
};

const COLORS: HighlightColor[] = ["yellow", "green", "blue", "pink"];

const DOTS: Record<HighlightColor, string> = {
  yellow: "#ffd84f",
  green: "#4dd589",
  blue: "#5aa7ff",
  pink: "#f67bc4",
};

function HighlightMiniToolbar({ visible, x, y, color, onAddNote, onChangeColor, onDelete }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!visible) setPaletteOpen(false);
  }, [visible]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.anchor,
        {
          left: Math.max(8, x - 78),
          top: Math.max(8, y - (paletteOpen ? 90 : 52)),
        },
      ]}
    >
      <View style={styles.card}>
        <Pressable onPress={onAddNote} style={styles.actionButton}>
          <Text style={styles.actionText}>Add Note</Text>
        </Pressable>
        <Pressable onPress={() => setPaletteOpen((prev) => !prev)} style={styles.actionButton}>
          <Text style={styles.actionText}>Color</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.actionButton}>
          <Text style={styles.actionDeleteText}>Delete</Text>
        </Pressable>
      </View>

      {paletteOpen ? (
        <View style={styles.paletteRow}>
          {COLORS.map((item) => {
            const selected = item === color;
            return (
              <Pressable
                key={item}
                onPress={() => {
                  onChangeColor(item);
                  setPaletteOpen(false);
                }}
                style={[styles.dotButton, selected ? styles.dotButtonSelected : null]}
              >
                <View style={[styles.dot, { backgroundColor: DOTS[item] }]} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    zIndex: 60,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c8d5de",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  actionButton: {
    minHeight: 38,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#243848",
  },
  actionDeleteText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b1303f",
  },
  paletteRow: {
    marginTop: 6,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cfdae2",
    padding: 6,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dotButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6dee5",
    justifyContent: "center",
    alignItems: "center",
  },
  dotButtonSelected: {
    borderColor: "#2d73dc",
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 999,
  },
});

export default React.memo(HighlightMiniToolbar);
