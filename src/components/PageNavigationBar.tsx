import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  onJumpToPage: (pageNumber: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const PageNavigationBar = React.memo(function PageNavigationBar({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  onJumpToPage,
}: Props) {
  const [draftPage, setDraftPage] = useState(String(currentPage));

  useEffect(() => {
    setDraftPage(String(currentPage));
  }, [currentPage]);

  const commitJump = () => {
    const parsed = Number(draftPage);
    if (!Number.isFinite(parsed)) {
      setDraftPage(String(currentPage));
      return;
    }
    onJumpToPage(clamp(Math.round(parsed), 1, Math.max(totalPages, 1)));
  };

  return (
    <View style={styles.shell}>
      <View style={styles.row}>
        <Pressable
          onPress={onPrevious}
          disabled={currentPage <= 1}
          style={({ pressed }) => [
            styles.navButton,
            currentPage <= 1 ? styles.navButtonDisabled : null,
            pressed ? styles.navButtonPressed : null,
          ]}
        >
          <Text style={styles.navButtonText}>Previous</Text>
        </Pressable>

        <View style={styles.jumpCard}>
          <Text style={styles.jumpLabel}>Page</Text>
          <TextInput
            value={draftPage}
            onChangeText={setDraftPage}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={commitJump}
            onBlur={commitJump}
            style={styles.jumpInput}
            maxLength={Math.max(String(totalPages).length, 1)}
          />
          <Text style={styles.jumpMeta}>{`of ${Math.max(totalPages, 1)}`}</Text>
        </View>

        <Pressable
          onPress={onNext}
          disabled={currentPage >= totalPages}
          style={({ pressed }) => [
            styles.navButton,
            styles.navButtonPrimary,
            currentPage >= totalPages ? styles.navButtonDisabled : null,
            pressed ? styles.navButtonPressed : null,
          ]}
        >
          <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: "transparent",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6d6052",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  navButtonPrimary: {
    backgroundColor: "#1f1c18",
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  navButtonPressed: {
    opacity: 0.88,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3f352c",
  },
  navButtonTextPrimary: {
    color: "#fffaf4",
  },
  jumpCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderRadius: 20,
    backgroundColor: "rgba(255,248,241,0.96)",
    paddingHorizontal: 16,
    gap: 8,
    shadowColor: "#6d6052",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  jumpLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7b6c5f",
    textTransform: "uppercase",
  },
  jumpInput: {
    minWidth: 34,
    paddingVertical: 0,
    fontSize: 18,
    fontWeight: "700",
    color: "#241e1a",
    textAlign: "center",
  },
  jumpMeta: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7a6d61",
  },
});

export default PageNavigationBar;
