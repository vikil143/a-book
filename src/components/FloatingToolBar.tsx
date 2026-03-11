import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Mode = "none" | "highlight" | "pen" | "marker" | "highlighter" | "underline" | "eraser" | "stroke_select";
type ToolKind = "pen" | "marker" | "highlighter" | "underline";

type Props = {
  mode: Mode;
  highlightMode: boolean;
  penMode: boolean;
  revisionMode: boolean;
  revisionImportantOnly: boolean;
  isBookmarked: boolean;
  toolStyles: Record<ToolKind, { width: number; color: string }>;
  onToggleHighlight: () => void;
  onTogglePen: () => void;
  onToggleBookmark: () => void;
  onPressTopics: () => void;
  onPressMore: () => void;
  onSetMode: (mode: Mode) => void;
  onAdjustWidth: (delta: number) => void;
  onSelectColor: (color: string) => void;
};

const INK_TOOLS: Array<{ key: Mode; label: string }> = [
  { key: "pen", label: "Pen" },
  { key: "marker", label: "Marker" },
  { key: "highlighter", label: "Glow" },
  { key: "underline", label: "Underline" },
  { key: "eraser", label: "Erase" },
  { key: "stroke_select", label: "Select" },
];

const PALETTE = ["#246de0", "#1f2630", "#e24b4b", "#2b9f55", "#7d4fe0", "#d18f24"];

function FloatingToolBar({
  mode,
  highlightMode,
  penMode,
  revisionMode,
  revisionImportantOnly,
  isBookmarked,
  toolStyles,
  onToggleHighlight,
  onTogglePen,
  onToggleBookmark,
  onPressTopics,
  onPressMore,
  onSetMode,
  onAdjustWidth,
  onSelectColor,
}: Props) {
  const activeInkTool: ToolKind =
    mode === "pen" || mode === "marker" || mode === "highlighter" || mode === "underline" ? mode : "pen";

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {revisionMode ? (
        <View style={styles.revisionBadge}>
          <Text style={styles.revisionBadgeTitle}>Revision mode</Text>
          <Text style={styles.revisionBadgeText}>{revisionImportantOnly ? "Important only" : "All marks visible"}</Text>
        </View>
      ) : null}

      <View style={styles.primaryDock}>
        <Pressable onPress={onToggleHighlight} style={({ pressed }) => [styles.primaryAction, highlightMode ? styles.primaryActionActive : null, pressed ? styles.pressed : null]}>
          <Text style={[styles.primaryActionText, highlightMode ? styles.primaryActionTextActive : null]}>Highlight</Text>
        </Pressable>
        <Pressable onPress={onTogglePen} style={({ pressed }) => [styles.primaryAction, penMode ? styles.primaryActionActive : null, pressed ? styles.pressed : null]}>
          <Text style={[styles.primaryActionText, penMode ? styles.primaryActionTextActive : null]}>Annotate</Text>
        </Pressable>
        <Pressable onPress={onToggleBookmark} style={({ pressed }) => [styles.primaryAction, isBookmarked ? styles.primaryActionActive : null, pressed ? styles.pressed : null]}>
          <Text style={[styles.primaryActionText, isBookmarked ? styles.primaryActionTextActive : null]}>Bookmark</Text>
        </Pressable>
        <Pressable onPress={onPressTopics} style={({ pressed }) => [styles.primaryAction, pressed ? styles.pressed : null]}>
          <Text style={styles.primaryActionText}>Topics</Text>
        </Pressable>
        <Pressable onPress={onPressMore} style={({ pressed }) => [styles.primaryAction, pressed ? styles.pressed : null]}>
          <Text style={styles.primaryActionText}>More</Text>
        </Pressable>
      </View>

      {penMode ? (
        <View style={styles.inkCard}>
          <View style={styles.inkToolRow}>
            {INK_TOOLS.map((tool) => {
              const active = mode === tool.key;
              return (
                <Pressable key={tool.key} onPress={() => onSetMode(tool.key)} style={({ pressed }) => [styles.inkChip, active ? styles.inkChipActive : null, pressed ? styles.pressed : null]}>
                  <Text style={[styles.inkChipText, active ? styles.inkChipTextActive : null]}>{tool.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {mode !== "eraser" && mode !== "stroke_select" ? (
            <View style={styles.adjustments}>
              <View style={styles.widthControl}>
                <Pressable onPress={() => onAdjustWidth(-1)} style={({ pressed }) => [styles.adjustButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.adjustButtonText}>-</Text>
                </Pressable>
                <Text style={styles.widthText}>{`${Math.round(toolStyles[activeInkTool].width * 10) / 10}px`}</Text>
                <Pressable onPress={() => onAdjustWidth(1)} style={({ pressed }) => [styles.adjustButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.adjustButtonText}>+</Text>
                </Pressable>
              </View>

              <View style={styles.paletteRow}>
                {PALETTE.map((color) => {
                  const selected = toolStyles[activeInkTool].color === color;
                  return (
                    <Pressable key={color} onPress={() => onSelectColor(color)} style={[styles.swatchWrap, selected ? styles.swatchWrapActive : null]}>
                      <View style={[styles.swatch, { backgroundColor: color }]} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 20,
    gap: 12,
    alignItems: "center",
  },
  revisionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,252,246,0.96)",
    shadowColor: "#6d5a38",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  revisionBadgeTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7d6b53",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  revisionBadgeText: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: "#2c2621",
  },
  primaryDock: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.9)",
    shadowColor: "#6c6053",
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  primaryAction: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#f5f1eb",
    justifyContent: "center",
    alignItems: "center",
  },
  primaryActionActive: {
    backgroundColor: "#1e1d1b",
  },
  primaryActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#403730",
  },
  primaryActionTextActive: {
    color: "#fff8f0",
  },
  pressed: {
    opacity: 0.82,
  },
  inkCard: {
    alignSelf: "stretch",
    borderRadius: 24,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.94)",
    shadowColor: "#6a5d50",
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    gap: 14,
  },
  inkToolRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inkChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#f4efe8",
    justifyContent: "center",
    alignItems: "center",
  },
  inkChipActive: {
    backgroundColor: "#efe6da",
  },
  inkChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5e5044",
  },
  inkChipTextActive: {
    color: "#261f19",
  },
  adjustments: {
    gap: 12,
  },
  widthControl: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#faf7f2",
  },
  adjustButton: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#efe8de",
    justifyContent: "center",
    alignItems: "center",
  },
  adjustButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#342b24",
  },
  widthText: {
    minWidth: 52,
    fontSize: 13,
    fontWeight: "700",
    color: "#473b31",
    textAlign: "center",
  },
  paletteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  swatchWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d7cdc0",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fffdf9",
  },
  swatchWrapActive: {
    borderColor: "#221d18",
    borderWidth: 2,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 999,
  },
});

export default React.memo(FloatingToolBar);
