/** Show an edit time. 1.88 stays 1.88, and a whole tenth stays one decimal. */
export function formatEditSeconds(value: number): string {
  if (!Number.isFinite(value)) return '0.0';
  const rounded = Number(value.toFixed(2));
  const hundredths = rounded.toFixed(2);
  return hundredths.endsWith('0') ? rounded.toFixed(1) : hundredths;
}
