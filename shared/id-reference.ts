/** Whether one string can be one HTML/ARIA ID reference rather than an ID-reference list. */
export function isIdReferenceToken(value: string): boolean {
  return value.length > 0 && !/[\t\n\f\r ]/.test(value);
}
