import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export type ReaderTopic = {
  id: string;
  name: string;
  color: string;
  is_visible: number;
  annotationCount: number;
};

type Props = {
  visible: boolean;
  topics: ReaderTopic[];
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
          <Text style={styles.title}>Topics</Text>
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
                <Text style={styles.count}>{topic.annotationCount}</Text>
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
    backgroundColor: "rgba(8, 14, 20, 0.2)",
  },
  drawer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    paddingTop: 50,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: -4, height: 0 },
    elevation: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#102131",
  },
  addButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c9d7e2",
    backgroundColor: "#f7fbff",
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  addButtonText: {
    fontSize: 12,
    color: "#193448",
    fontWeight: "700",
  },
  list: {
    gap: 8,
  },
  topicRow: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7e1e9",
    backgroundColor: "#fcfeff",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  topicRowSelected: {
    borderColor: "#2274de",
    backgroundColor: "#edf5ff",
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  topicName: {
    flex: 1,
    fontSize: 14,
    color: "#132536",
    fontWeight: "700",
  },
  count: {
    fontSize: 13,
    color: "#4f6578",
    fontWeight: "700",
    width: 24,
    textAlign: "center",
  },
  visibilityChip: {
    minHeight: 30,
    minWidth: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  visible: {
    backgroundColor: "#e8f6ec",
    borderWidth: 1,
    borderColor: "#9bd2ad",
  },
  hidden: {
    backgroundColor: "#f2f5f8",
    borderWidth: 1,
    borderColor: "#d0dae2",
  },
  visibilityText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2d4254",
  },
});

export default React.memo(TopicsDrawer);
