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
          top: Math.max(8, y - (paletteOpen ? 98 : 58)),
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
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.97)",
    shadowColor: "#57493c",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  actionButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2c2621",
  },
  actionDeleteText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b43c4d",
  },
  paletteRow: {
    marginTop: 8,
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 16,
    padding: 8,
    shadowColor: "#57493c",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  dotButton: {
    width: 30,
    height: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2d6ca",
    justifyContent: "center",
    alignItems: "center",
  },
  dotButtonSelected: {
    borderColor: "#3c77cc",
    shadowColor: "#6d95d7",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 999,
  },
});

export default React.memo(HighlightMiniToolbar);
