import { getDBAdapter } from "../../db";
import { getLlmProvider } from "../../providers";
import type { Job, Word, Definition } from "../../models";
import type { DefinitionResult } from "../../providers";

function hasUsableSenses(definition: Definition): boolean {
  const firstSense = definition.senses?.[0] || "";
  return firstSense.length > 0 && !firstSense.startsWith("[Error]") && firstSense !== "暂无释义";
}

export async function processDefiningStage(job: Job): Promise<void> {
  const db = getDBAdapter();
  const llmProvider = getLlmProvider();

  const document = await db.findById("documents", job.documentId);
  if (!document) {
    throw new Error(`Document ${job.documentId} not found`);
  }

  const existingWords = await db.findMany<Word>("words", {
    documentId: job.documentId,
  });

  const wordsNeedingDefinitions: string[] = [];
  for (const word of existingWords) {
    const existingDef = await db.findMany<Definition>("definitions", {
      lemma: word.lemma,
      userId: document.userId,
    });

    if (!existingDef.some(hasUsableSenses)) {
      wordsNeedingDefinitions.push(word.lemma);
    }
  }

  if (wordsNeedingDefinitions.length === 0) {
    await db.update("jobs", job.id, {
      result: {
        ...job.result,
        definitionsGenerated: 0,
      },
    });
    return;
  }

  const llmResults: DefinitionResult[] = [];
  const batchSize = 30;
  for (let i = 0; i < wordsNeedingDefinitions.length; i += batchSize) {
    const batch = wordsNeedingDefinitions.slice(i, i + batchSize);
    const batchResults = await llmProvider.defineWords(batch, {
      maxSenses: 5,
      includePos: true,
    });
    llmResults.push(...batchResults);
  }

  let totalGenerated = 0;
  for (const result of llmResults) {
    const matchedWord = existingWords.find((w) => w.lemma === result.lemma);
    if (!matchedWord) {
      continue;
    }

    await db.create<Definition>("definitions", {
      type: "definition",
      userId: document.userId,
      wordId: matchedWord.id,
      lemma: result.lemma,
      pos: result.pos,
      senses: result.senses,
      source: "generated",
      model: result.model,
      definitionVersion: "v1",
    });
    totalGenerated += 1;
  }

  await db.update("jobs", job.id, {
    result: {
      ...job.result,
      definitionsGenerated: totalGenerated,
    },
  });
}
