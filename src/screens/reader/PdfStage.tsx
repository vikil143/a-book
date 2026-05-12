import React, { useCallback, useMemo } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Pdf from "react-native-pdf";

export type PdfStageMetrics = {
  pageNumber: number;
  totalPages?: number;
  containerWidth: number;
  containerHeight: number;
};

type Props = {
  source: { uri: string };
  pdfRef: React.RefObject<any>;
  pageNumber: number;
  totalPages?: number;
  singlePage?: boolean;
  scrollEnabled: boolean;
  horizontal?: boolean;
  enablePaging?: boolean;
  fitPolicy?: 0 | 1 | 2;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  minScale?: number;
  maxScale?: number;
  enableDoubleTapZoom?: boolean;
  onLayoutSize: (size: { width: number; height: number }) => void;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number) => void;
  onError: (error: unknown) => void;
  renderOverlay?: (metrics: PdfStageMetrics) => React.ReactNode;
};

type PdfSurfaceProps = {
  source: { uri: string };
  pdfRef: React.RefObject<any>;
  pageNumber: number;
  singlePage?: boolean;
  scrollEnabled: boolean;
  horizontal?: boolean;
  enablePaging?: boolean;
  fitPolicy?: 0 | 1 | 2;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  minScale?: number;
  maxScale?: number;
  enableDoubleTapZoom?: boolean;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number) => void;
  onError: (error: unknown) => void;
};

const PdfSurface = React.memo(function PdfSurfaceImpl({
  source,
  pdfRef,
  pageNumber,
  singlePage = false,
  scrollEnabled,
  horizontal = false,
  enablePaging = false,
  fitPolicy = 2,
  showsHorizontalScrollIndicator = false,
  showsVerticalScrollIndicator = false,
  minScale = 1,
  maxScale = 1,
  enableDoubleTapZoom = false,
  onLoadComplete,
  onPageChanged,
  onError,
}: PdfSurfaceProps) {
  return (
    <Pdf
      key={`${source.uri}::${pageNumber}::${singlePage ? "single" : "multi"}`}
      ref={pdfRef}
      source={source}
      style={styles.pdf}
      page={pageNumber}
      singlePage={singlePage}
      scrollEnabled={scrollEnabled}
      horizontal={horizontal}
      enablePaging={enablePaging}
      fitPolicy={fitPolicy}
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      minScale={minScale}
      maxScale={maxScale}
      enableDoubleTapZoom={enableDoubleTapZoom}
      onLoadComplete={(pages) => onLoadComplete(pages)}
      onPageChanged={(nextPage) => onPageChanged(nextPage)}
      onError={onError}
    />
  );
});

function PdfStageImpl({
  source,
  pdfRef,
  pageNumber,
  totalPages,
  singlePage,
  scrollEnabled,
  horizontal,
  enablePaging,
  fitPolicy,
  showsHorizontalScrollIndicator,
  showsVerticalScrollIndicator,
  minScale,
  maxScale,
  enableDoubleTapZoom,
  onLayoutSize,
  onLoadComplete,
  onPageChanged,
  onError,
  renderOverlay,
}: Props) {
  const [container, setContainer] = React.useState({ width: 0, height: 0 });

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setContainer((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
      onLayoutSize({ width, height });
    },
    [onLayoutSize]
  );

  const metrics = useMemo<PdfStageMetrics>(
    () => ({
      pageNumber,
      totalPages,
      containerWidth: container.width,
      containerHeight: container.height,
    }),
    [container.height, container.width, pageNumber, totalPages]
  );

  return (
    <View style={styles.container} onLayout={onLayout}>
      <PdfSurface
        source={source}
        pdfRef={pdfRef}
        pageNumber={pageNumber}
        singlePage={singlePage}
        scrollEnabled={scrollEnabled}
        horizontal={horizontal}
        enablePaging={enablePaging}
        fitPolicy={fitPolicy}
        showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        minScale={minScale}
        maxScale={maxScale}
        enableDoubleTapZoom={enableDoubleTapZoom}
        onLoadComplete={onLoadComplete}
        onPageChanged={onPageChanged}
        onError={onError}
      />
      {renderOverlay ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
          {renderOverlay(metrics)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  pdf: {
    flex: 1,
    backgroundColor: "#eff3f8",
  },
});

const PdfStage = React.memo(PdfStageImpl);

export default PdfStage;
