export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export type ToolKind = "pen" | "marker";

export type StrokePoint = {
  x: number;
  y: number;
};

export type HighlightRow = {
  id: string;
  book_id: string;
  page_number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: HighlightColor;
  topic_id?: string | null;
  created_at: number;
  updated_at: number;
};

export type StrokeRow = {
  id: string;
  book_id: string;
  page_number: number;
  topic_id?: string | null;
  tool: ToolKind;
  color: string;
  width: number;
  points_json: string;
  created_at: number;
  updated_at: number;
};
