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
          <Text style={styles.navButtonText}>Prev</Text>
        </Pressable>

        <View style={styles.jumpCard}>
          <Text style={styles.jumpLabel}>Jump</Text>
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
          <Text style={styles.jumpMeta}>/ {Math.max(totalPages, 1)}</Text>
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
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: "rgba(242, 246, 251, 0.96)",
    borderTopWidth: 1,
    borderTopColor: "#d9e3eb",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#c9d6e1",
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  navButtonPrimary: {
    borderColor: "#21579e",
    backgroundColor: "#163a67",
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  navButtonPressed: {
    opacity: 0.88,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#193046",
  },
  navButtonTextPrimary: {
    color: "#ffffff",
  },
  jumpCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d3dfe8",
    backgroundColor: "#fcfeff",
    paddingHorizontal: 12,
    gap: 6,
  },
  jumpLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#54697c",
    textTransform: "uppercase",
  },
  jumpInput: {
    minWidth: 34,
    paddingVertical: 0,
    fontSize: 18,
    fontWeight: "800",
    color: "#102131",
    textAlign: "center",
  },
  jumpMeta: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5f7181",
  },
});

export default PageNavigationBar;
