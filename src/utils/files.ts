import RNFS from "react-native-fs";

export function uid() {
  return `${Date.now()}-${Math.random()}`;
}

export async function savePdfToAppStorage(fileUri: string) {
  // Store inside app sandbox
  const dir = `${RNFS.DocumentDirectoryPath}/pdfs`;
  await RNFS.mkdir(dir);

  const name = `book-${Date.now()}.pdf`;
  const destPath = `${dir}/${name}`;

  // On Android, DocumentPicker uri can be content://
  // RNFS.copyFile supports file:// paths; for content:// use copyFile from uri after stat (works in many cases)
  // If it fails, we’ll handle fallback in Day 3 with content resolver.
  await RNFS.copyFile(fileUri, destPath);

  return destPath;
}
