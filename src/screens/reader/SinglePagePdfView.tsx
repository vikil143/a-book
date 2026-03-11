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
      <Text style={styles.notebookLabel}>Study Page</Text>

      <FlingGestureHandler direction={Directions.RIGHT} onHandlerStateChange={onSwipeRight}>
        <FlingGestureHandler direction={Directions.LEFT} onHandlerStateChange={onSwipeLeft}>
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
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: "#eef3f8",
  },
  notebookLabel: {
    alignSelf: "center",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#6a7d8e",
  },
  pageCard: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7e1e9",
    shadowColor: "#06111d",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  pageBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(11, 28, 45, 0.84)",
  },
  pageBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },
  swipeHint: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  swipeHintText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#53687b",
  },
});

export default React.memo(SinglePagePdfView);
