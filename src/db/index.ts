import SQLite from "react-native-sqlite-storage";

SQLite.enablePromise(true);

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabase({ name: "pdf_notes.db", location: "default" });
  return dbInstance;
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

  return db;
}
