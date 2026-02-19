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

patchReactNativeSqliteStorageJCenter();
