import { stripPosPrefix } from "@/lib/meaning-clean";

interface DefinitionLike {
  pos?: string;
  senses?: string[];
}

interface PosGroup {
  pos?: string;
  senses: string[];
}

function normalizeSenses(senses: string[] | undefined): string[] {
  return (senses ?? []).map((sense) => sense.trim()).filter((sense) => sense.length > 0);
}

function normalizePosTags(pos: string | undefined): string[] {
  if (!pos) {
    return [];
  }

  return pos
    .split(/[\/|,，;；]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function splitSensesByPos(definition: DefinitionLike): PosGroup[] {
  const senses = normalizeSenses(definition.senses);
  if (senses.length === 0) {
    return [];
  }

  const posTags = normalizePosTags(definition.pos);
  if (posTags.length <= 1) {
    return [{ pos: posTags[0], senses }];
  }

  const groups: PosGroup[] = [];
  const total = senses.length;
  const count = posTags.length;
  const base = Math.floor(total / count);
  const remainder = total % count;
  let cursor = 0;

  for (let index = 0; index < count; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    const chunk = senses.slice(cursor, cursor + size);
    cursor += size;
    if (chunk.length > 0) {
      groups.push({ pos: posTags[index], senses: chunk });
    }
  }

  if (groups.length === 0) {
    return [{ senses }];
  }

  return groups;
}

function formatGroup(group: PosGroup): string {
  const posText = group.pos?.trim();
  const sensesText = group.senses.map((sense) => stripPosPrefix(sense, posText)).join("；");
  if (!posText) {
    return sensesText;
  }

  return `【${posText}】${sensesText}`;
}

function getAllGroups(definitions: DefinitionLike[] | undefined): PosGroup[] {
  return (definitions ?? []).flatMap((definition) => splitSensesByPos(definition));
}

export function formatPrimaryDefinition(definitions: DefinitionLike[] | undefined, fallback: string): string {
  const firstGroup = getAllGroups(definitions)[0];
  if (!firstGroup || firstGroup.senses.length === 0) {
    return fallback;
  }

  const firstSense = stripPosPrefix(firstGroup.senses[0], firstGroup.pos);
  if (!firstGroup.pos) {
    return firstSense;
  }

  return `【${firstGroup.pos}】${firstSense}`;
}

export function formatDefinitionsInline(definitions: DefinitionLike[] | undefined, fallback: string): string {
  const formattedDefinitions = getAllGroups(definitions).map((group) => formatGroup(group));

  if (formattedDefinitions.length === 0) {
    return fallback;
  }

  return formattedDefinitions.join("；");
}
