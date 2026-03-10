export function resolveGenerateLemma(input: string, suggestion?: string): string {
  const suggested = suggestion?.trim();
  if (suggested) {
    return suggested;
  }
  return input.trim();
}
