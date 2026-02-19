import React, { useState } from 'react';
import {
  View,
  Button,
  useWindowDimensions,
  ScrollView,
  Alert,
  TouchableOpacity,
  Text,
} from 'react-native';
import RenderHTML from 'react-native-render-html';
import { pick, types, isCancel } from '@react-native-documents/picker';
import Clipboard from '@react-native-clipboard/clipboard';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';

export default function PdfToHtmlScreen() {
  const [html, setHtml] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const { width } = useWindowDimensions();

  const uploadPdf = async (pdfUri, name, mimeType) => {
    try {
      const form = new FormData();
      form.append('file', {
        uri: pdfUri,
        name: name || 'file.pdf',
        type: mimeType || 'application/pdf',
      });

      console.log("upload pdf ...")
      const resp = await fetch('http://10.0.2.2:3000/pdf-to-html', {
        method: 'POST',
        body: form,
        headers: {
          // DON'T set Content-Type manually for multipart in fetch
        },
      });

      console.log("response pdf", resp);

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(errorText || `Upload failed (${resp.status})`);
      }

      const htmlText = await resp.text();
      setHtml(htmlText);
    } catch (error) {
        console.log("Error pdf", error);
    }
  };

  const pickAndUploadPdf = async () => {
    try {
      setIsUploading(true);
      setHtml('');

      const res = await pick({
        type: [types.pdf],
        copyTo: 'cachesDirectory',
      });

      const result = Array.isArray(res) ? res[0] : res;
      if (!result) {
        Alert.alert('Error', 'No PDF was selected');
        return;
      }

      const pickedUri = result.fileCopyUri || result.uri;
      if (!pickedUri) {
        Alert.alert('Error', 'Could not get file URI');
        return;
      }

      let uploadUri = pickedUri;
      if (pickedUri.startsWith('content://')) {
        const destPath = `${RNFS.CachesDirectoryPath}/picked_${Date.now()}.pdf`;
        await RNBlobUtil.fs.cp(pickedUri, destPath);
        uploadUri = `file://${destPath}`;
      }

      await uploadPdf(uploadUri, result.name, result.mimeType);
    } catch (e) {
      if (!isCancel(e)) {
        Alert.alert('Error', 'Failed to upload PDF');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const copyHtml = () => {
    Clipboard.setString(html);
    Alert.alert('Copied', 'HTML copied to clipboard');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12 }}>
      <Button
        title={isUploading ? 'Uploading...' : 'Upload PDF and Convert'}
        onPress={pickAndUploadPdf}
        disabled={isUploading}
      />

      {!!html && (
        <View style={{ marginTop: 16 }}>
          <TouchableOpacity onPress={copyHtml} style={{ marginBottom: 8 }}>
            <Text style={{ color: '#1a73e8', fontWeight: '600' }}>
              Copy HTML
            </Text>
          </TouchableOpacity>
          <RenderHTML contentWidth={width} source={{ html }} />
        </View>
      )}
    </ScrollView>
  );
}
