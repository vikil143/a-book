import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeTouchEvent,
} from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import Animated, { type SharedValue, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import type { PageMarksSummary } from "../db/marksSummary";

type Props = {
  totalPages: number;
  currentPage: number;
  currentPageSv: SharedValue<number>;
  marksSummary: PageMarksSummary[];
  onJumpToPage: (pageNumber: number) => void;
};

type Tick = {
  key: string;
  pageNumber: number;
  color: string;
  density: number;
};

const RAIL_WIDTH = 18;
const HIT_WIDTH = 36;
const INDICATOR_SIZE = 14;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pageToY(pageNumber: number, totalPages: number, railHeight: number) {
  if (totalPages <= 1 || railHeight <= 0) return 0;
  return ((clamp(pageNumber, 1, totalPages) - 1) / (totalPages - 1)) * railHeight;
}

function yToPage(y: number, totalPages: number, railHeight: number) {
  if (totalPages <= 1 || railHeight <= 0) return 1;
  const ratio = clamp(y / railHeight, 0, 1);
  return clamp(Math.round(ratio * (totalPages - 1)) + 1, 1, totalPages);
}

function MarksRailImpl({ totalPages, currentPage, currentPageSv, marksSummary, onJumpToPage }: Props) {
  const [railHeight, setRailHeight] = useState(1);
  const [markedListVisible, setMarkedListVisible] = useState(false);
  const indicatorTargetYSv = useSharedValue(0);
  const scrubYSv = useSharedValue(0);
  const isScrubbingSv = useSharedValue(0);
  const lastScrubbedPageRef = useRef<number>(currentPage);

  const maxDensity = useMemo(() => {
    let max = 1;
    marksSummary.forEach((item) => {
      if (item.totalCount > max) max = item.totalCount;
    });
    return max;
  }, [marksSummary]);

  const ticks = useMemo<Tick[]>(() => {
    const next: Tick[] = [];
    marksSummary.forEach((row) => {
      if (row.highlightCount > 0) {
        next.push({
          key: `h-${row.pageNumber}`,
          pageNumber: row.pageNumber,
          color: "#f2cc3f",
          density: row.highlightCount,
        });
      }
      if (row.strokeCount > 0) {
        next.push({
          key: `s-${row.pageNumber}`,
          pageNumber: row.pageNumber,
          color: "#2f6fd8",
          density: row.strokeCount,
        });
      }
      if (row.bookmarkCount > 0) {
        next.push({
          key: `b-${row.pageNumber}`,
          pageNumber: row.pageNumber,
          color: "#2f9a5a",
          density: row.bookmarkCount,
        });
      }
    });
    return next;
  }, [marksSummary]);

  useEffect(() => {
    currentPageSv.value = currentPage;
  }, [currentPage, currentPageSv]);

  useEffect(() => {
    const targetY = pageToY(currentPage, totalPages, railHeight);
    indicatorTargetYSv.value = withTiming(targetY, { duration: 180 });
  }, [currentPage, indicatorTargetYSv, railHeight, totalPages]);

  const indicatorYSv = useDerivedValue(() => {
    return isScrubbingSv.value ? scrubYSv.value : indicatorTargetYSv.value;
  });

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: indicatorYSv.value - INDICATOR_SIZE / 2 }],
    };
  });

  const pageBubbleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: indicatorYSv.value - 11 }],
    };
  });

  const triggerScrubPage = useCallback(
    (y: number) => {
      const nextY = clamp(y, 0, railHeight);
      scrubYSv.value = nextY;
      const nextPage = yToPage(nextY, totalPages, railHeight);
      currentPageSv.value = nextPage;

      if (nextPage === lastScrubbedPageRef.current) return;
      lastScrubbedPageRef.current = nextPage;
      onJumpToPage(nextPage);
    },
    [currentPageSv, onJumpToPage, railHeight, scrubYSv, totalPages]
  );

  const onRailGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (event.nativeEvent.state !== State.ACTIVE) return;
      triggerScrubPage(event.nativeEvent.y);
    },
    [triggerScrubPage]
  );

  const onRailStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, y } = event.nativeEvent;

      if (state === State.BEGAN) {
        isScrubbingSv.value = 1;
        triggerScrubPage(y);
        return;
      }

      if (state === State.ACTIVE) {
        triggerScrubPage(y);
        return;
      }

      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        triggerScrubPage(y);
        isScrubbingSv.value = 0;
      }
    },
    [isScrubbingSv, triggerScrubPage]
  );

  const onRailLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.max(1, Math.round(event.nativeEvent.layout.height));
    setRailHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);

  const onRailTap = useCallback(
    (event: NativeSyntheticEvent<NativeTouchEvent>) => {
      const nextPage = yToPage(event.nativeEvent.locationY, totalPages, railHeight);
      onJumpToPage(nextPage);
    },
    [onJumpToPage, railHeight, totalPages]
  );

  const markedRows = useMemo(() => marksSummary.filter((row) => row.totalCount > 0), [marksSummary]);

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Pressable style={styles.markedPagesBtn} onPress={() => setMarkedListVisible(true)}>
        <Text style={styles.markedPagesBtnText}>Marked</Text>
      </Pressable>

      <View pointerEvents="box-none" style={styles.railWrap}>
        <Animated.View pointerEvents="none" style={[styles.pageBubble, pageBubbleStyle]}>
          <Text style={styles.pageBubbleText}>{`${currentPage}/${totalPages}`}</Text>
        </Animated.View>

        <PanGestureHandler onGestureEvent={onRailGestureEvent} onHandlerStateChange={onRailStateChange}>
          <View style={styles.hitArea}>
            <Pressable onPressIn={onRailTap} style={styles.hitAreaPressable}>
              <View style={styles.rail} onLayout={onRailLayout}>
                {ticks.map((tick) => {
                  const y = pageToY(tick.pageNumber, totalPages, railHeight);
                  const densityScale = Math.min(1, tick.density / maxDensity);
                  const tickHeight = 2 + Math.round(densityScale * 3);
                  const tickOpacity = 0.5 + densityScale * 0.5;

                  return (
                    <Pressable
                      key={tick.key}
                      onPress={() => onJumpToPage(tick.pageNumber)}
                      hitSlop={8}
                      style={[
                        styles.tick,
                        {
                          top: y - tickHeight / 2,
                          backgroundColor: tick.color,
                          height: tickHeight,
                          opacity: tickOpacity,
                        },
                      ]}
                    />
                  );
                })}

                <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
              </View>
            </Pressable>
          </View>
        </PanGestureHandler>
      </View>

      <Modal visible={markedListVisible} transparent animationType="fade" onRequestClose={() => setMarkedListVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMarkedListVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Marked Pages</Text>
            <FlatList
              data={markedRows}
              keyExtractor={(item) => `${item.pageNumber}`}
              ListEmptyComponent={<Text style={styles.emptyText}>No marked pages yet</Text>}
              renderItem={({ item }) => {
                return (
                  <Pressable
                    onPress={() => {
                      onJumpToPage(item.pageNumber);
                      setMarkedListVisible(false);
                    }}
                    style={[styles.row, item.pageNumber === currentPage ? styles.rowActive : null]}
                  >
                    <Text style={styles.rowText}>{`Page ${item.pageNumber} • ${item.totalCount} marks`}</Text>
                    <View style={styles.rowMetaWrap}>
                      {item.highlightCount > 0 ? <View style={[styles.metaDot, styles.metaDotHighlight]} /> : null}
                      {item.strokeCount > 0 ? <View style={[styles.metaDot, styles.metaDotStroke]} /> : null}
                      {item.bookmarkCount > 0 ? <View style={[styles.metaDot, styles.metaDotBookmark]} /> : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  railWrap: {
    position: "absolute",
    right: 2,
    top: 44,
    bottom: 104,
    width: HIT_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  hitArea: {
    width: HIT_WIDTH,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  hitAreaPressable: {
    width: HIT_WIDTH,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  rail: {
    width: RAIL_WIDTH,
    height: "100%",
    borderRadius: 10,
    backgroundColor: "rgba(16, 40, 66, 0.12)",
    overflow: "hidden",
  },
  tick: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 3,
  },
  indicator: {
    position: "absolute",
    left: -4,
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#0f2944",
  },
  pageBubble: {
    position: "absolute",
    right: HIT_WIDTH + 3,
    width: 56,
    minHeight: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f2944",
  },
  pageBubbleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  markedPagesBtn: {
    position: "absolute",
    right: 6,
    top: 10,
    minHeight: 28,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#c9d7e5",
  },
  markedPagesBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#113152",
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6, 14, 22, 0.3)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "52%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#112537",
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: "#587086",
    paddingVertical: 12,
  },
  row: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6e1eb",
    paddingHorizontal: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fcff",
  },
  rowActive: {
    borderColor: "#3d79dc",
    backgroundColor: "#eaf2ff",
  },
  rowText: {
    fontSize: 13,
    color: "#132f47",
    fontWeight: "700",
  },
  rowMetaWrap: {
    flexDirection: "row",
    gap: 4,
  },
  metaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metaDotHighlight: {
    backgroundColor: "#f2cc3f",
  },
  metaDotStroke: {
    backgroundColor: "#2f6fd8",
  },
  metaDotBookmark: {
    backgroundColor: "#2f9a5a",
  },
});

const MarksRail = React.memo(MarksRailImpl);

export default MarksRail;
