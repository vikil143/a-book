const fs = require("fs");
const path = require("path");

function patchReactNativeSqliteStorageJCenter() {
  const gradleFile = path.join(
    __dirname,
    "..",
    "node_modules",
    "react-native-sqlite-storage",
    "platforms",
    "android",
    "build.gradle"
  );

  if (!fs.existsSync(gradleFile)) {
    console.log("[postinstall] sqlite-storage gradle file not found, skipping.");
    return;
  }

  const original = fs.readFileSync(gradleFile, "utf8");
  if (!original.includes("jcenter()")) {
    console.log("[postinstall] sqlite-storage jcenter patch already applied.");
    return;
  }

  const patched = original.replace("jcenter()", "mavenCentral()");
  fs.writeFileSync(gradleFile, patched, "utf8");
  console.log("[postinstall] patched sqlite-storage: jcenter() -> mavenCentral().");
}

function patchReactNativePdfPdfiumVersion() {
  const gradleFile = path.join(__dirname, "..", "node_modules", "react-native-pdf", "android", "build.gradle");

  if (!fs.existsSync(gradleFile)) {
    console.log("[postinstall] react-native-pdf gradle file not found, skipping.");
    return;
  }

  const original = fs.readFileSync(gradleFile, "utf8");
  const current = "implementation 'io.legere:pdfiumandroid:1.0.32'";
  const next = "implementation 'io.legere:pdfiumandroid:1.0.35'";

  if (original.includes(next)) {
    console.log("[postinstall] react-native-pdf pdfiumandroid patch already applied.");
    return;
  }

  if (!original.includes(current)) {
    console.log("[postinstall] react-native-pdf pdfiumandroid target line not found, skipping.");
    return;
  }

  const patched = original.replace(current, next);
  fs.writeFileSync(gradleFile, patched, "utf8");
  console.log("[postinstall] patched react-native-pdf: pdfiumandroid 1.0.32 -> 1.0.35.");
}

patchReactNativeSqliteStorageJCenter();
patchReactNativePdfPdfiumVersion();
