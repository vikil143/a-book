import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export type HighlightRow = {
  id: string;
  book_id: string;
  page_number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: HighlightColor;
  topic_id?: string | null;
  created_at: number;
  updated_at: number;
};

type Props = {
  width: number;
  height: number;
  highlights: HighlightRow[];
  disabled?: boolean;
  activeHighlightId?: string | null;
  onPressHighlight: (highlight: HighlightRow) => void;
};

const COLOR_MAP: Record<HighlightColor, string> = {
  yellow: "rgba(255, 220, 79, 0.35)",
  green: "rgba(77, 213, 137, 0.35)",
  blue: "rgba(90, 167, 255, 0.30)",
  pink: "rgba(246, 123, 196, 0.32)",
};

function HighlightLayerImpl({ width, height, highlights, disabled, activeHighlightId, onPressHighlight }: Props) {
  if (!width || !height) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {highlights.map((h) => {
        const left = h.x * width;
        const top = h.y * height;
        const rectWidth = h.w * width;
        const rectHeight = h.h * height;

        return (
          <Pressable
            key={h.id}
            disabled={disabled}
            onPress={() => onPressHighlight(h)}
            style={[
              styles.highlight,
              h.id === activeHighlightId ? styles.highlightActive : null,
              {
                left,
                top,
                width: rectWidth,
                height: rectHeight,
                backgroundColor: COLOR_MAP[h.color] || COLOR_MAP.yellow,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  highlight: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(30, 30, 30, 0.22)",
    borderRadius: 8,
  },
  highlightActive: {
    borderColor: "rgba(37, 93, 184, 0.68)",
    borderWidth: 2,
    shadowColor: "#498fff",
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
});

const HighlightLayer = React.memo(HighlightLayerImpl);

export default HighlightLayer;
