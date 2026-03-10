export type ReviewDirection = "en-zh" | "zh-en";

export interface ReviewStep {
  cardId: string;
  direction: ReviewDirection;
}

export interface ReviewSession {
  steps: ReviewStep[];
  currentIndex: number;
}

export function createInitialReviewSession(cardIds: string[]): ReviewSession {
  const steps = cardIds.flatMap((cardId) => [
    { cardId, direction: "en-zh" as const },
    { cardId, direction: "zh-en" as const },
  ]);

  return {
    steps,
    currentIndex: 0,
  };
}

export function applyReviewAnswer(session: ReviewSession, isCorrect: boolean): ReviewSession {
  if (session.currentIndex >= session.steps.length) {
    return session;
  }

  const currentStep = session.steps[session.currentIndex];
  const nextSteps = [...session.steps];

  if (!isCorrect) {
    nextSteps.push(currentStep);
  }

  return {
    steps: nextSteps,
    currentIndex: session.currentIndex + 1,
  };
}

export function getCurrentReviewStep(session: ReviewSession): ReviewStep | null {
  return session.steps[session.currentIndex] ?? null;
}
