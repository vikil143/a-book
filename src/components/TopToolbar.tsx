import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  title: string;
  page: number;
  totalPages: number;
  currentPageNotes: number;
  currentPageMarks: number;
  currentPageTopicCount: number;
  highlightMode: boolean;
  penMode: boolean;
  revisionMode: boolean;
  revisionImportantOnly: boolean;
  isBookmarked: boolean;
  onPressBack: () => void;
  onToggleHighlight: () => void;
  onTogglePen: () => void;
  onToggleBookmark: () => void;
  onPressTopics: () => void;
  onPressExport: () => void;
  onToggleRevision: () => void;
  onToggleRevisionImportantOnly: () => void;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  onPress: () => void;
};

function ToolbarButton({ label, active, onPress }: ToolbarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolButton,
        active ? styles.toolButtonActive : null,
        pressed ? styles.toolButtonPressed : null,
      ]}
      hitSlop={8}
    >
      <Text style={[styles.toolButtonText, active ? styles.toolButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const TopToolbar = React.memo(function TopToolbar({
  title,
  page,
  totalPages,
  currentPageNotes,
  currentPageMarks,
  currentPageTopicCount,
  highlightMode,
  penMode,
  revisionMode,
  revisionImportantOnly,
  isBookmarked,
  onPressBack,
  onToggleHighlight,
  onTogglePen,
  onToggleBookmark,
  onPressTopics,
  onPressExport,
  onToggleRevision,
  onToggleRevisionImportantOnly,
}: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={styles.leftArea}>
          <ToolbarButton label="Back" onPress={onPressBack} />
          <View style={styles.titleWrap}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.titleText}>
              {title}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.pageText}>
                {page} / {Math.max(totalPages, 1)}
              </Text>
              <Text style={styles.metaText}>{`${currentPageNotes} notes`}</Text>
              <Text style={styles.metaText}>{`${currentPageMarks} marks`}</Text>
              <Text style={styles.metaText}>{`${currentPageTopicCount} topics`}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <ToolbarButton label="Highlight" active={highlightMode} onPress={onToggleHighlight} />
          <ToolbarButton label="Pen" active={penMode} onPress={onTogglePen} />
          <ToolbarButton label="Mark" active={isBookmarked} onPress={onToggleBookmark} />
          <ToolbarButton label="Topics" onPress={onPressTopics} />
          <ToolbarButton label="Export" onPress={onPressExport} />
          <ToolbarButton label="Rev" active={revisionMode} onPress={onToggleRevision} />
        </View>
      </View>
      {revisionMode ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Revision Mode</Text>
          <Pressable style={styles.badgeToggle} onPress={onToggleRevisionImportantOnly}>
            <Text style={styles.badgeToggleText}>
              {revisionImportantOnly ? "Important only: On" : "Important only: Off"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e7ebef",
    shadowColor: "#001016",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  leftArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0e1b24",
  },
  pageText: {
    fontSize: 12,
    color: "#5d6e7b",
    marginTop: 2,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  metaText: {
    fontSize: 11,
    color: "#607483",
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toolButton: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d0d9e0",
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f7fafc",
  },
  toolButtonActive: {
    borderColor: "#1570ef",
    backgroundColor: "#e6f0ff",
  },
  toolButtonPressed: {
    opacity: 0.85,
  },
  toolButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#20303e",
  },
  toolButtonTextActive: {
    color: "#0f56bd",
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginLeft: 52,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#edf8ef",
  },
  badgeText: {
    fontSize: 12,
    color: "#207744",
    fontWeight: "700",
  },
  badgeToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#9bd2ad",
    backgroundColor: "#f7fff9",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeToggleText: {
    fontSize: 11,
    color: "#1d6a3e",
    fontWeight: "700",
  },
});

export default TopToolbar;
