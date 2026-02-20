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
  scrollEnabled: boolean;
  onLayoutSize: (size: { width: number; height: number }) => void;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number) => void;
  onError: (error: unknown) => void;
  renderOverlay?: (metrics: PdfStageMetrics) => React.ReactNode;
};

type PdfSurfaceProps = {
  source: { uri: string };
  pdfRef: React.RefObject<any>;
  scrollEnabled: boolean;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number) => void;
  onError: (error: unknown) => void;
};

const PdfSurface = React.memo(function PdfSurfaceImpl({
  source,
  pdfRef,
  scrollEnabled,
  onLoadComplete,
  onPageChanged,
  onError,
}: PdfSurfaceProps) {
  return (
    <Pdf
      ref={pdfRef}
      source={source}
      style={styles.pdf}
      scrollEnabled={scrollEnabled}
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
  scrollEnabled,
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
        scrollEnabled={scrollEnabled}
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
