// The PDF library's browser build, as `pdf.ts` uses it; it comes without types of its own.
declare module 'pdfmake/build/pdfmake' {
  interface PdfMake {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    setFonts(fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>): void;
    createPdf(definition: Record<string, unknown>): { getBlob(): Promise<Blob> };
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}
