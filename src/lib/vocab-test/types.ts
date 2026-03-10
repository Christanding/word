export type VocabLevel = "cet4" | "cet6" | "ielts" | "gre";

export interface VocabQuestion {
  id: string;
  level: VocabLevel;
  word: string;
  pos?: string;
  correctMeaning: string;
  options: string[];
  explanation: string;
  source: "bank" | "ai";
}

export interface VocabAnswerRecord {
  questionId: string;
  word: string;
  pos?: string;
  level: VocabLevel;
  responseType: "option" | "unsure" | "unknown";
  correctMeaning: string;
  selectedMeaning: string | null;
  knew: boolean;
  isCorrect: boolean;
  explanation: string;
  answeredAt: string;
}

export interface VocabAssessmentState {
  sessionId: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  endedAt?: string;
  priorVocab?: number;
  currentLevel: VocabLevel;
  startedLevel: VocabLevel;
  questionCount: number;
  aiQuestionCount: number;
  confidence: number;
  estimatedVocab: number;
  recommendedLevel: VocabLevel;
  lowConfidenceResult?: boolean;
  askedWords: string[];
  answers: VocabAnswerRecord[];
  correctStreak: number;
  seenOptionMeanings?: string[];
  currentQuestion?: VocabQuestion;
}
