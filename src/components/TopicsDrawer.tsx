import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export type ReaderTopic = {
  id: string;
  name: string;
  color: string;
  is_visible: number;
  annotationCount: number;
  pageAnnotationCount?: number;
};

type Props = {
  visible: boolean;
  topics: ReaderTopic[];
  currentPage: number;
  activeTopicId: string | null;
  onClose: () => void;
  onSelectTopic: (topicId: string) => void;
  onToggleVisibility: (topicId: string, nextVisible: number) => void;
  onAddTopic: () => void;
  onLongPressTopic: (topicId: string) => void;
};

const DRAWER_WIDTH = 290;

function TopicsDrawer({
  visible,
  topics,
  currentPage,
  activeTopicId,
  onClose,
  onSelectTopic,
  onToggleVisibility,
  onAddTopic,
  onLongPressTopic,
}: Props) {
  const x = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(x, { toValue: 0, damping: 20, stiffness: 240, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(x, { toValue: DRAWER_WIDTH, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [opacity, visible, x]);

  return (
    <View pointerEvents={visible ? "auto" : "none"} style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateX: x }] }]}> 
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Topics</Text>
            <Text style={styles.subtitle}>Page {currentPage} focus</Text>
          </View>
          <Pressable onPress={onAddTopic} style={styles.addButton}>
            <Text style={styles.addButtonText}>Add Topic</Text>
          </Pressable>
        </View>

        <View style={styles.list}>
          {topics.map((topic) => {
            const selected = topic.id === activeTopicId;
            return (
              <Pressable
                key={topic.id}
                onPress={() => onSelectTopic(topic.id)}
                onLongPress={() => onLongPressTopic(topic.id)}
                style={[styles.topicRow, selected ? styles.topicRowSelected : null]}
              >
                <View style={[styles.colorDot, { backgroundColor: topic.color }]} />
                <Text numberOfLines={1} style={styles.topicName}>
                  {topic.name}
                </Text>
                <View style={styles.countWrap}>
                  <Text style={styles.count}>{topic.pageAnnotationCount ?? 0}</Text>
                  <Text style={styles.countMeta}>Pg</Text>
                </View>
                <Pressable
                  onPress={() => onToggleVisibility(topic.id, topic.is_visible ? 0 : 1)}
                  style={[styles.visibilityChip, topic.is_visible ? styles.visible : styles.hidden]}
                >
                  <Text style={styles.visibilityText}>{topic.is_visible ? "On" : "Off"}</Text>
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18, 14, 10, 0.18)",
  },
  drawer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#fffdf9",
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    paddingTop: 56,
    paddingHorizontal: 18,
    shadowColor: "#5b4d40",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: -4, height: 0 },
    elevation: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1f1a16",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#74675b",
    fontWeight: "600",
  },
  addButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#f2ebe2",
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  addButtonText: {
    fontSize: 12,
    color: "#433a31",
    fontWeight: "700",
  },
  list: {
    gap: 10,
  },
  topicRow: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#fff8f0",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  topicRowSelected: {
    backgroundColor: "#f3ece3",
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  topicName: {
    flex: 1,
    fontSize: 14,
    color: "#251f1a",
    fontWeight: "700",
  },
  countWrap: {
    minWidth: 34,
    alignItems: "center",
  },
  count: {
    fontSize: 14,
    color: "#3e3329",
    fontWeight: "800",
    textAlign: "center",
  },
  countMeta: {
    fontSize: 10,
    color: "#8c7d71",
    fontWeight: "700",
  },
  visibilityChip: {
    minHeight: 32,
    minWidth: 48,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  visible: {
    backgroundColor: "#e9f5ed",
  },
  hidden: {
    backgroundColor: "#efe8de",
  },
  visibilityText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4d4035",
  },
});

export default React.memo(TopicsDrawer);
