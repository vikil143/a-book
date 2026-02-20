import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { type SharedValue } from "react-native-reanimated";
import type { HighlightRow, StrokeRow } from "../readerTypes";
import HighlightOverlay from "./HighlightOverlay";
import PenLayer, { type LiveStroke } from "./PenLayer";

type Props = {
  pageNumber: number;
  containerWidth: number;
  containerHeight: number;
  highlights: HighlightRow[];
  strokes: StrokeRow[];
  activeHighlightId?: string | null;
  highlightDisabled?: boolean;
  activeStroke: SharedValue<LiveStroke | null>;
  eraseMode: boolean;
  strokeSelectable: boolean;
  captureGestures: boolean;
  onPressHighlight: (highlight: HighlightRow) => void;
  onPressStroke: (stroke: StrokeRow) => void;
  children?: React.ReactNode;
};

function OverlayRootImpl({
  pageNumber,
  containerWidth,
  containerHeight,
  highlights,
  strokes,
  activeHighlightId,
  highlightDisabled,
  activeStroke,
  eraseMode,
  strokeSelectable,
  captureGestures,
  onPressHighlight,
  onPressStroke,
  children,
}: Props) {
  const pageHighlights = useMemo(
    () => highlights.filter((item) => item.page_number === pageNumber),
    [highlights, pageNumber]
  );
  const pageStrokes = useMemo(
    () => strokes.filter((item) => item.page_number === pageNumber),
    [pageNumber, strokes]
  );

  return (
    <View pointerEvents={captureGestures ? "auto" : "box-none"} style={styles.root}>
      <HighlightOverlay
        width={containerWidth}
        height={containerHeight}
        highlights={pageHighlights}
        activeHighlightId={activeHighlightId}
        disabled={highlightDisabled}
        onPressHighlight={onPressHighlight}
      />

      <PenLayer
        width={containerWidth}
        height={containerHeight}
        strokes={pageStrokes}
        activeStroke={activeStroke}
        eraseMode={eraseMode}
        selectable={strokeSelectable}
        onPressStroke={onPressStroke}
      />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default React.memo(OverlayRootImpl);
