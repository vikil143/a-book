import { getDB } from "./index";
import type { HighlightRow, StrokeRow } from "../screens/readerTypes";

export type ExportBookMeta = {
  id: string;
  title: string;
  local_path: string;
};

export async function getBookExportMeta(bookId: string): Promise<ExportBookMeta | null> {
  const db = await getDB();
  const result = await db.executeSql("SELECT id, title, local_path FROM books WHERE id = ? LIMIT 1", [bookId]);
  if (!result[0].rows.length) return null;
  return result[0].rows.item(0) as ExportBookMeta;
}

export async function getExportHighlightsForPage(bookId: string, pageNumber: number): Promise<HighlightRow[]> {
  const db = await getDB();
  const result = await db.executeSql(
    `SELECT id, book_id, page_number, x, y, w, h, color, topic_id, created_at, updated_at
     FROM highlights
     WHERE book_id = ? AND page_number = ?
     ORDER BY created_at ASC`,
    [bookId, pageNumber]
  );

  const rows: HighlightRow[] = [];
  for (let index = 0; index < result[0].rows.length; index += 1) {
    rows.push(result[0].rows.item(index) as HighlightRow);
  }
  return rows;
}

export async function getExportStrokesForPage(bookId: string, pageNumber: number): Promise<StrokeRow[]> {
  const db = await getDB();
  const result = await db.executeSql(
    `SELECT id, book_id, page_number, topic_id, tool, color, width, points_json, created_at, updated_at
     FROM strokes
     WHERE book_id = ? AND page_number = ?
     ORDER BY created_at ASC`,
    [bookId, pageNumber]
  );

  const rows: StrokeRow[] = [];
  for (let index = 0; index < result[0].rows.length; index += 1) {
    rows.push(result[0].rows.item(index) as StrokeRow);
  }
  return rows;
}
