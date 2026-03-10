export interface SM2Params {
  quality: number; // 0-5
  easeFactor?: number;
  intervalDays?: number;
  repetitions?: number;
}

export interface SM2Result {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextDueAt: Date;
}

/**
 * SuperMemo-2 (SM-2) Algorithm Implementation
 * Based on: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */
export function sm2(params: SM2Params, dueDate?: Date): SM2Result {
  const { quality, easeFactor = 2.5, intervalDays = 0, repetitions = 0 } = params;
  
  let newEaseFactor = easeFactor;
  let newIntervalDays = intervalDays;
  let newRepetitions = repetitions;
  
  // Update ease factor
  newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEaseFactor < 1.3) {
    newEaseFactor = 1.3;
  }
  
  // Update repetitions and interval
  if (quality >= 3) {
    // Successful recall
    newRepetitions = repetitions + 1;
    
    if (newRepetitions === 1) {
      newIntervalDays = 1;
    } else if (newRepetitions === 2) {
      newIntervalDays = 6;
    } else {
      newIntervalDays = Math.round(intervalDays * newEaseFactor);
    }
  } else {
    // Failed recall - reset
    newRepetitions = 0;
    newIntervalDays = 1;
  }
  
  // Calculate next due date
  const nextDueAt = new Date();
  if (dueDate) {
    nextDueAt.setTime(dueDate.getTime());
  }
  nextDueAt.setDate(nextDueAt.getDate() + newIntervalDays);
  
  return {
    easeFactor: newEaseFactor,
    intervalDays: newIntervalDays,
    repetitions: newRepetitions,
    nextDueAt,
  };
}

export function calculateSM2(
  quality: number,
  currentEaseFactor: number = 2.5,
  currentInterval: number = 0,
  currentRepetitions: number = 0
): SM2Result {
  return sm2({
    quality,
    easeFactor: currentEaseFactor,
    intervalDays: currentInterval,
    repetitions: currentRepetitions,
  });
}
