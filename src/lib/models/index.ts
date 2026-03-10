import { z } from "zod";

// Base fields for all documents
const baseSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  userId: z.string(),
});

// Document: represents an uploaded file
export const documentSchema = baseSchema.extend({
  type: z.literal("document"),
  filename: z.string(),
  originalPath: z.string(),
  extractedPath: z.string().optional(),
  fullTextPath: z.string().optional(),
  fileSize: z.number(),
  fileType: z.enum(["pdf", "docx", "xlsx", "image"]),
  status: z.enum(["uploaded", "processing", "completed", "failed"]),
  wordCount: z.number().optional(),
});

// Job: represents an async processing job
export const jobSchema = baseSchema.extend({
  type: z.literal("job"),
  documentId: z.string(),
  stage: z.enum(["ingested", "extracting", "normalizing", "defining", "done", "failed"]),
  progress: z.number().min(0).max(100),
  maxAttempts: z.number().default(3),
  attempts: z.number().default(0),
  lastError: z.string().optional(),
  leaseUntil: z.string().datetime().optional(),
  result: z.any().optional(),
});

// Job Event: audit log for job state changes
export const jobEventSchema = baseSchema.extend({
  type: z.literal("job_event"),
  jobId: z.string(),
  stage: z.enum(["ingested", "extracting", "normalizing", "defining", "done", "failed"]),
  message: z.string(),
  metadata: z.any().optional(),
});

// Word: extracted English word (lemma form)
export const wordSchema = baseSchema.extend({
  type: z.literal("word"),
  documentId: z.string(),
  lemma: z.string(),
  frequency: z.number().default(1),
});

// Definition: Chinese definition for a word
export const definitionSchema = baseSchema.extend({
  type: z.literal("definition"),
  wordId: z.string(),
  lemma: z.string(),
  pos: z.string().optional(), // part of speech
  senses: z.array(z.string()).min(1).max(3),
  source: z.enum(["extracted", "generated"]).default("generated"),
  model: z.string().optional(),
  definitionVersion: z.string().default("v1"),
});

// Card: flashcard for SRS review
export const cardSchema = baseSchema.extend({
  type: z.literal("card"),
  wordId: z.string(),
  definitionId: z.string(),
  lemma: z.string(),
  pos: z.string().optional(),
  senses: z.array(z.string()),
  nextDueAt: z.string().datetime().optional(),
});

// Review: SRS review record
export const reviewSchema = baseSchema.extend({
  type: z.literal("review"),
  cardId: z.string(),
  quality: z.number().min(0).max(5),
  easeFactor: z.number().default(2.5),
  intervalDays: z.number().default(0),
  repetitions: z.number().default(0),
  nextDueAt: z.string().datetime(),
  lastReviewedAt: z.string().datetime(),
});

// Quota Counter: track daily usage
export const quotaCounterSchema = baseSchema.extend({
  type: z.literal("quota_counter"),
  date: z.string(), // YYYY-MM-DD
  ocrPages: z.number().default(0),
  llmTokens: z.number().default(0),
});

// Vocab Assessment: adaptive vocabulary size test session/result
export const vocabAssessmentSchema = baseSchema.extend({
  type: z.literal("vocab_assessment"),
  status: z.enum(["in_progress", "completed", "abandoned"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  priorVocab: z.number().optional(),
  confidencePolicyVersion: z.number().int().default(1),
  startedLevel: z.enum(["cet4", "cet6", "ielts", "gre"]),
  currentLevel: z.enum(["cet4", "cet6", "ielts", "gre"]),
  questionCount: z.number().default(0),
  aiQuestionCount: z.number().default(0),
  confidence: z.number().min(0).max(1).default(0),
  estimatedVocab: z.number().default(0),
  recommendedLevel: z.enum(["cet4", "cet6", "ielts", "gre"]).default("cet4"),
  lowConfidenceResult: z.boolean().default(false),
  askedWords: z.array(z.string()).default([]),
  answers: z.array(z.any()).default([]),
  seenOptionMeanings: z.array(z.string()).default([]),
  currentQuestion: z.any().optional(),
  correctStreak: z.number().default(0),
});

// Imported wordlist for adaptive vocab test (hidden API use)
export const vocabWordlistSchema = baseSchema.extend({
  type: z.literal("vocab_wordlist"),
  level: z.enum(["cet4", "cet6", "ielts", "gre"]),
  entries: z.array(
    z.object({
      word: z.string(),
      pos: z.string().optional(),
      meaning: z.string(),
      explanation: z.string(),
    })
  ),
});

export const userSchema = baseSchema.extend({
  type: z.literal("user"),
  email: z.string().email(),
  passwordHash: z.string().min(1),
  role: z.enum(["admin", "user"]).default("user"),
  status: z.enum(["active", "disabled"]).default("active"),
});

// Export types
export type Document = z.infer<typeof documentSchema>;
export type Job = z.infer<typeof jobSchema>;
export type JobEvent = z.infer<typeof jobEventSchema>;
export type Word = z.infer<typeof wordSchema>;
export type Definition = z.infer<typeof definitionSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type QuotaCounter = z.infer<typeof quotaCounterSchema>;
export type VocabAssessment = z.infer<typeof vocabAssessmentSchema>;
export type VocabWordlist = z.infer<typeof vocabWordlistSchema>;
export type User = z.infer<typeof userSchema>;

// Union type for all entities
export type Entity =
  | Document
  | Job
  | JobEvent
  | Word
  | Definition
  | Card
  | Review
  | QuotaCounter
  | VocabAssessment
  | VocabWordlist
  | User;
export type EntityType = Entity["type"];

// Helper to create base fields
export function createBaseFields(userId: string, id?: string) {
  const now = new Date().toISOString();
  return {
    id: id || crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    userId,
  };
}
