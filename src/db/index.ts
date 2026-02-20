import SQLite from "react-native-sqlite-storage";

SQLite.enablePromise(true);

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabase({ name: "pdf_notes.db", location: "default" });
  await dbInstance.executeSql("PRAGMA foreign_keys = ON;");
  return dbInstance;
}

async function hasColumn(db: SQLite.SQLiteDatabase, table: string, column: string): Promise<boolean> {
  const result = await db.executeSql(`PRAGMA table_info(${table});`);
  const rows = result[0].rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows.item(i) as { name: string };
    if (row.name === column) return true;
  }
  return false;
}

export async function initDB() {
  const db = await getDB();

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      local_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
      y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
      w REAL NOT NULL CHECK (w >= 0 AND w <= 1),
      h REAL NOT NULL CHECK (h >= 0 AND h <= 1),
      color TEXT NOT NULL DEFAULT 'yellow',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );
  `);

  const notesHasHighlightId = await hasColumn(db, "notes", "highlight_id");
  if (!notesHasHighlightId) {
    await db.executeSql("ALTER TABLE notes ADD COLUMN highlight_id TEXT NULL;");
  }

  const notesHasStarred = await hasColumn(db, "notes", "starred");
  if (!notesHasStarred) {
    await db.executeSql("ALTER TABLE notes ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;");
  }

  const notesHasKind = await hasColumn(db, "notes", "note_kind");
  if (!notesHasKind) {
    await db.executeSql("ALTER TABLE notes ADD COLUMN note_kind TEXT NOT NULL DEFAULT 'normal';");
  }

  const highlightsHasTopicId = await hasColumn(db, "highlights", "topic_id");
  if (!highlightsHasTopicId) {
    await db.executeSql("ALTER TABLE highlights ADD COLUMN topic_id TEXT NULL;");
  }

  await db.executeSql("CREATE INDEX IF NOT EXISTS idx_notes_book_updated ON notes(book_id, updated_at DESC);");
  await db.executeSql("CREATE INDEX IF NOT EXISTS idx_highlights_book_page ON highlights(book_id, page_number);");
  await db.executeSql("CREATE INDEX IF NOT EXISTS idx_topics_book ON topics(book_id);");
  await db.executeSql("CREATE INDEX IF NOT EXISTS idx_bookmarks_book_page ON bookmarks(book_id, page_number);");
  await db.executeSql("CREATE INDEX IF NOT EXISTS idx_notes_book_kind_starred ON notes(book_id, note_kind, starred);");
  await db.executeSql("CREATE INDEX IF NOT EXISTS idx_highlights_book_topic ON highlights(book_id, topic_id);");

  await db.executeSql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_highlight_unique
    ON notes(highlight_id)
    WHERE highlight_id IS NOT NULL;
  `);

  await db.executeSql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_unique_page
    ON bookmarks(book_id, page_number);
  `);

  return db;
}
