declare module "pdf-lib" {
  export type RGB = { type: "RGB"; red: number; green: number; blue: number };

  export function rgb(red: number, green: number, blue: number): RGB;

  export class PDFPage {
    getSize(): { width: number; height: number };
    drawRectangle(options: {
      x: number;
      y: number;
      width: number;
      height: number;
      color?: RGB;
      opacity?: number;
      borderColor?: RGB;
      borderWidth?: number;
    }): void;
    drawLine(options: {
      start: { x: number; y: number };
      end: { x: number; y: number };
      thickness?: number;
      color?: RGB;
      opacity?: number;
    }): void;
  }

  export class PDFDocument {
    static load(data: Uint8Array): Promise<PDFDocument>;
    getPages(): PDFPage[];
    save(): Promise<Uint8Array>;
  }
}
