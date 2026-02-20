import { getDB } from "./index";

export type PageMarksSummary = {
  pageNumber: number;
  highlightCount: number;
  strokeCount: number;
  bookmarkCount: number;
  totalCount: number;
};

type CountRow = {
  page_number: number;
  cnt: number;
};

function ensurePage(map: Map<number, PageMarksSummary>, pageNumber: number) {
  const normalized = Math.max(1, Number(pageNumber) || 1);
  const existing = map.get(normalized);
  if (existing) return existing;

  const next: PageMarksSummary = {
    pageNumber: normalized,
    highlightCount: 0,
    strokeCount: 0,
    bookmarkCount: 0,
    totalCount: 0,
  };
  map.set(normalized, next);
  return next;
}

export async function getBookMarksSummary(bookId: string): Promise<PageMarksSummary[]> {
  const db = await getDB();

  const [strokeResult, highlightResult, bookmarkResult] = await Promise.all([
    db.executeSql("SELECT page_number, COUNT(*) AS cnt FROM strokes WHERE book_id = ? GROUP BY page_number", [bookId]),
    db.executeSql("SELECT page_number, COUNT(*) AS cnt FROM highlights WHERE book_id = ? GROUP BY page_number", [bookId]),
    db.executeSql("SELECT page_number, COUNT(*) AS cnt FROM bookmarks WHERE book_id = ? GROUP BY page_number", [bookId]),
  ]);

  const map = new Map<number, PageMarksSummary>();

  const strokeRows = strokeResult[0].rows;
  for (let i = 0; i < strokeRows.length; i++) {
    const row = strokeRows.item(i) as CountRow;
    const target = ensurePage(map, row.page_number);
    target.strokeCount = Number(row.cnt) || 0;
  }

  const highlightRows = highlightResult[0].rows;
  for (let i = 0; i < highlightRows.length; i++) {
    const row = highlightRows.item(i) as CountRow;
    const target = ensurePage(map, row.page_number);
    target.highlightCount = Number(row.cnt) || 0;
  }

  const bookmarkRows = bookmarkResult[0].rows;
  for (let i = 0; i < bookmarkRows.length; i++) {
    const row = bookmarkRows.item(i) as CountRow;
    const target = ensurePage(map, row.page_number);
    target.bookmarkCount = Number(row.cnt) || 0;
  }

  const summary = Array.from(map.values())
    .map((item) => ({
      ...item,
      totalCount: item.highlightCount + item.strokeCount + item.bookmarkCount,
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  return summary;
}
