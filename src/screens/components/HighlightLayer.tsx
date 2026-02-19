import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

export type HighlightColor = "yellow" | "green" | "pink";

export type HighlightRow = {
  id: string;
  book_id: string;
  page_number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: HighlightColor;
  created_at: number;
  updated_at: number;
};

type Props = {
  width: number;
  height: number;
  highlights: HighlightRow[];
  disabled?: boolean;
  onPressHighlight: (highlight: HighlightRow) => void;
};

const COLOR_MAP: Record<HighlightColor, string> = {
  yellow: "rgba(255, 220, 0, 0.35)",
  green: "rgba(80, 220, 120, 0.35)",
  pink: "rgba(255, 105, 180, 0.32)",
};

function HighlightLayerImpl({ width, height, highlights, disabled, onPressHighlight }: Props) {
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
    borderColor: "rgba(30, 30, 30, 0.28)",
    borderRadius: 4,
  },
});

const HighlightLayer = React.memo(HighlightLayerImpl);

export default HighlightLayer;
