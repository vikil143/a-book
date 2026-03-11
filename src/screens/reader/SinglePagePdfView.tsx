import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlingGestureHandler, Directions, State } from "react-native-gesture-handler";
import PdfStage, { type PdfStageMetrics } from "./PdfStage";

type Props = {
  source: { uri: string };
  pdfRef: React.RefObject<any>;
  pageNumber: number;
  totalPages: number;
  interactionLocked?: boolean;
  onLayoutSize: (size: { width: number; height: number }) => void;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number) => void;
  onError: (error: unknown) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  renderOverlay?: (metrics: PdfStageMetrics) => React.ReactNode;
};

function SinglePagePdfView({
  source,
  pdfRef,
  pageNumber,
  totalPages,
  interactionLocked = false,
  onLayoutSize,
  onLoadComplete,
  onPageChanged,
  onError,
  onNextPage,
  onPreviousPage,
  renderOverlay,
}: Props) {
  const pageBadge = useMemo(() => `${pageNumber} / ${Math.max(totalPages, 1)}`, [pageNumber, totalPages]);

  const onSwipeLeft = useCallback(
    ({ nativeEvent }: { nativeEvent: { state: number } }) => {
      if (interactionLocked || nativeEvent.state !== State.END || pageNumber >= totalPages) return;
      onNextPage();
    },
    [interactionLocked, onNextPage, pageNumber, totalPages]
  );

  const onSwipeRight = useCallback(
    ({ nativeEvent }: { nativeEvent: { state: number } }) => {
      if (interactionLocked || nativeEvent.state !== State.END || pageNumber <= 1) return;
      onPreviousPage();
    },
    [interactionLocked, onPreviousPage, pageNumber]
  );

  return (
    <View style={styles.viewport}>
      <View style={styles.header}>
        <Text style={styles.notebookLabel}>Focused reading</Text>
        <Text style={styles.notebookCaption}>Single-page notebook mode</Text>
      </View>

      <FlingGestureHandler direction={Directions.RIGHT} onHandlerStateChange={onSwipeRight}>
        <FlingGestureHandler direction={Directions.LEFT} onHandlerStateChange={onSwipeLeft}>
          <View style={styles.pageShell}>
            <View style={styles.pageCard}>
              <PdfStage
                source={source}
                pdfRef={pdfRef}
                pageNumber={pageNumber}
                totalPages={totalPages}
                scrollEnabled={!interactionLocked}
                horizontal
                enablePaging
                fitPolicy={2}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                minScale={1}
                maxScale={1}
                enableDoubleTapZoom={false}
                onLayoutSize={onLayoutSize}
                onLoadComplete={onLoadComplete}
                onPageChanged={onPageChanged}
                onError={onError}
                renderOverlay={renderOverlay}
              />

              <View pointerEvents="none" style={styles.pageBadge}>
                <Text style={styles.pageBadgeText}>{pageBadge}</Text>
              </View>

              <View pointerEvents="none" style={styles.pageEdgeGlow} />
            </View>
          </View>
        </FlingGestureHandler>
      </FlingGestureHandler>

      {!interactionLocked ? (
        <View style={styles.swipeHint}>
          <Text style={styles.swipeHintText}>Swipe to turn page</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 118,
    gap: 14,
    backgroundColor: "transparent",
  },
  header: {
    alignItems: "center",
  },
  notebookLabel: {
    alignSelf: "center",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#8a7f72",
  },
  notebookCaption: {
    marginTop: 6,
    fontSize: 14,
    color: "#5f554b",
    fontWeight: "600",
  },
  pageShell: {
    flex: 1,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  pageCard: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#ece1d3",
    shadowColor: "#5f4d3a",
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  pageBadge: {
    position: "absolute",
    top: 18,
    right: 18,
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(31, 28, 24, 0.84)",
  },
  pageBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fffaf5",
  },
  pageEdgeGlow: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: -24,
    height: 48,
    borderRadius: 999,
    backgroundColor: "rgba(243, 228, 208, 0.85)",
  },
  swipeHint: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  swipeHintText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b5f53",
  },
});

export default React.memo(SinglePagePdfView);
