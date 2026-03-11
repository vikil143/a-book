import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  title: string;
  page: number;
  totalPages: number;
  currentPageNotes: number;
  currentPageMarks: number;
  currentPageTopicCount: number;
  onPressBack: () => void;
  onPressMore: () => void;
};

const PremiumHeader = React.memo(function PremiumHeader({
  title,
  page,
  totalPages,
  currentPageNotes,
  currentPageMarks,
  currentPageTopicCount,
  onPressBack,
  onPressMore,
}: Props) {
  return (
    <View style={styles.shell}>
      <View style={styles.row}>
        <Pressable onPress={onPressBack} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]} hitSlop={8}>
          <Text style={styles.iconButtonText}>Back</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{`${currentPageNotes} notes`}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{`${currentPageMarks} marks`}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{`${currentPageTopicCount} topics`}</Text>
          </View>
        </View>

        <View style={styles.trailing}>
          <View style={styles.pagePill}>
            <Text style={styles.pagePillText}>{`${page} / ${Math.max(totalPages, 1)}`}</Text>
          </View>
          <Pressable onPress={onPressMore} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]} hitSlop={8}>
            <Text style={styles.iconButtonText}>More</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: "rgba(248, 245, 238, 0.92)",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.78)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#817566",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  pressed: {
    opacity: 0.8,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#342f2b",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e1a17",
    letterSpacing: -0.3,
  },
  metaRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6e665d",
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#d2c7ba",
  },
  trailing: {
    alignItems: "flex-end",
    gap: 8,
  },
  pagePill: {
    minHeight: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#efe6da",
    justifyContent: "center",
    alignItems: "center",
  },
  pagePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5e5348",
  },
});

export default PremiumHeader;
