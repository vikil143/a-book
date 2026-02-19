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
      x REAL NOT NULL,
      y REAL NOT NULL,
      w REAL NOT NULL,
      h REAL NOT NULL,
      color TEXT NOT NULL DEFAULT 'yellow',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );
  `);

  const notesHasHighlightId = await hasColumn(db, "notes", "highlight_id");
  if (!notesHasHighlightId) {
    await db.executeSql("ALTER TABLE notes ADD COLUMN highlight_id TEXT NULL;");
  }

  await db.executeSql("CREATE INDEX IF NOT EXISTS idx_notes_book_updated ON notes(book_id, updated_at DESC);");
  await db.executeSql("CREATE INDEX IF NOT EXISTS idx_highlights_book_page ON highlights(book_id, page_number);");

  await db.executeSql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_highlight_unique
    ON notes(highlight_id)
    WHERE highlight_id IS NOT NULL;
  `);

  return db;
}
