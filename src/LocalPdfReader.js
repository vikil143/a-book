import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Alert } from "react-native";
import Pdf from "react-native-pdf";
import { pick, types, isCancel } from "@react-native-documents/picker";

import RNFS from "react-native-fs";
import RNBlobUtil from "react-native-blob-util";

export default function LocalPdfReader() {
  const [pdfPath, setPdfPath] = useState(null);

  const pickPdf = async () => {
    try {
      const res = await pick({
        type: [types.pdf],
        copyTo: "cachesDirectory",
      });

      const result = Array.isArray(res) ? res[0] : res;
      if (!result) {
        Alert.alert("Error", "No PDF was selected");
        return;
      }

      // On Android, fileCopyUri is usually the safe one
      const uri = result.fileCopyUri || result.uri;

      console.log("pick ufl", uri);

      if (!uri) {
        Alert.alert("Error", "Could not get file URI");
        return;
      }

      // Normalize uri for react-native-pdf:
      // - If it's "file://..." keep it
      // - If it's content://, we copy it to cache path (already done by copyTo for most cases)
      if (uri.startsWith("content://")) {
        // fallback: manually copy content:// to cache
        const destPath = `${RNFS.CachesDirectoryPath}/picked_${Date.now()}.pdf`;

        await RNBlobUtil.fs.cp(uri, destPath);
        setPdfPath(`file://${destPath}`);
      } else {
        setPdfPath(uri);
      }
    } catch (e) {
      if (isCancel(e)) return;
      console.log(e);
      Alert.alert("Error", "Failed to pick PDF");
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.btn} onPress={pickPdf}>
        <Text style={styles.btnText}>Pick PDF</Text>
      </TouchableOpacity>

      {!pdfPath ? (
        <Text style={styles.hint}>Choose a PDF to preview it here.</Text>
      ) : (
        <Pdf
          source={{ uri: pdfPath }}
          style={styles.pdf}
          onError={(err) => console.log("PDF error:", err)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 20 },
  btn: { padding: 14, backgroundColor: "#222", margin: 12, borderRadius: 10 },
  btnText: { color: "#fff", textAlign: "center", fontWeight: "600" },
  hint: { textAlign: "center", marginTop: 20 },
  pdf: { flex: 1, width: Dimensions.get("window").width },
});
