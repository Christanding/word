function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePos(pos: string | undefined): string | undefined {
  const trimmed = pos?.trim();
  return trimmed ? trimmed : undefined;
}

export function stripPosPrefix(text: string, pos?: string): string {
  let result = text.trim();
  const normalizedPos = normalizePos(pos);
  if (!result || !normalizedPos) {
    return result;
  }

  const escapedPos = escapeRegExp(normalizedPos);
  const patterns = [
    new RegExp(`^【\\s*${escapedPos}\\s*】\\s*`, "iu"),
    new RegExp(`^${escapedPos}\\s*`, "iu"),
  ];

  let changed = true;
  while (changed && result.length > 0) {
    changed = false;
    for (const pattern of patterns) {
      const next = result.replace(pattern, "").trim();
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
  }

  return result;
}
