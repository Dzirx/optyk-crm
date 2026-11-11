/** Kwota w złotych do wyświetlenia: „699,98 zł” (przecinek dziesiętny, bez separatora tysięcy). */
export function formatPln(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} zł`;
}
