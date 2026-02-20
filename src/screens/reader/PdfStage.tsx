import React, { useCallback } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Pdf from "react-native-pdf";

type Props = {
  source: { uri: string };
  pdfRef: React.RefObject<any>;
  scrollEnabled: boolean;
  onLayoutSize: (size: { width: number; height: number }) => void;
  onLoadComplete: (pages: number) => void;
  onPageChanged: (page: number) => void;
  onError: (error: unknown) => void;
};

function PdfStageImpl({ source, pdfRef, scrollEnabled, onLayoutSize, onLoadComplete, onPageChanged, onError }: Props) {
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      onLayoutSize({ width, height });
    },
    [onLayoutSize]
  );

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Pdf
        ref={pdfRef}
        source={source}
        style={styles.pdf}
        scrollEnabled={scrollEnabled}
        onLoadComplete={(pages) => onLoadComplete(pages)}
        onPageChanged={(nextPage) => onPageChanged(nextPage)}
        onError={onError}
      />
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
