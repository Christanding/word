export interface ManualDefinitionInput {
  pos?: string;
  sensesText?: string;
}

export interface ManualDefinition {
  pos?: string;
  senses: string[];
}

function normalizePos(pos: string | undefined): string | undefined {
  const normalized = pos?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeSenseList(text: string | undefined): string[] {
  return (text ?? "")
    .split(/[;；\n]+/)
    .map((sense) => sense.trim())
    .filter((sense) => sense.length > 0);
}

export function normalizeManualLemma(lemma: string): string {
  return lemma.trim().toLowerCase();
}

export function normalizeManualDefinitions(definitions: ManualDefinitionInput[]): ManualDefinition[] {
  return definitions
    .map((definition) => ({
      pos: normalizePos(definition.pos),
      senses: normalizeSenseList(definition.sensesText),
    }))
    .filter((definition) => definition.senses.length > 0);
}

function getPosKey(pos: string | undefined): string {
  return (pos ?? "__none__").toLowerCase();
}

export function mergeDefinitionsByPos(
  existingDefinitions: ManualDefinition[],
  incomingDefinitions: ManualDefinition[]
): ManualDefinition[] {
  const merged = new Map<string, ManualDefinition>();

  const append = (definition: ManualDefinition) => {
    const key = getPosKey(definition.pos);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        pos: definition.pos,
        senses: Array.from(new Set(definition.senses)),
      });
      return;
    }

    current.senses = Array.from(new Set([...current.senses, ...definition.senses]));
  };

  existingDefinitions.forEach(append);
  incomingDefinitions.forEach(append);

  return Array.from(merged.values());
}

export function shouldSkipDefinitionVerification(hasGeneratedSuccessfully: boolean): boolean {
  return hasGeneratedSuccessfully;
}
