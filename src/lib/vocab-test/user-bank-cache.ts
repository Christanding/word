import type { QuestionBank } from "./bank";

const USER_BANK_CACHE_KEY = "__WORD_USER_QUESTION_BANK_CACHE__";
const USER_BANK_IN_FLIGHT_KEY = "__WORD_USER_QUESTION_BANK_IN_FLIGHT__";

type UserBankCacheStore = Map<string, QuestionBank>;
type UserBankInFlightStore = Map<string, Promise<QuestionBank>>;
type GlobalUserBankCache = typeof globalThis & {
  [USER_BANK_CACHE_KEY]?: UserBankCacheStore;
  [USER_BANK_IN_FLIGHT_KEY]?: UserBankInFlightStore;
};

function getStore(): UserBankCacheStore {
  const target = globalThis as GlobalUserBankCache;
  if (!target[USER_BANK_CACHE_KEY]) {
    target[USER_BANK_CACHE_KEY] = new Map();
  }
  return target[USER_BANK_CACHE_KEY];
}

function getInFlightStore(): UserBankInFlightStore {
  const target = globalThis as GlobalUserBankCache;
  if (!target[USER_BANK_IN_FLIGHT_KEY]) {
    target[USER_BANK_IN_FLIGHT_KEY] = new Map();
  }
  return target[USER_BANK_IN_FLIGHT_KEY];
}

export function getCachedUserQuestionBank(userId: string): QuestionBank | null {
  return getStore().get(userId) || null;
}

export function setCachedUserQuestionBank(userId: string, bank: QuestionBank) {
  getStore().set(userId, bank);
}

export async function loadUserQuestionBank(userId: string, loader: () => Promise<QuestionBank>): Promise<QuestionBank> {
  const cached = getCachedUserQuestionBank(userId);
  if (cached) {
    return cached;
  }

  const inFlightStore = getInFlightStore();
  const existing = inFlightStore.get(userId);
  if (existing) {
    return existing;
  }

  const pending = loader()
    .then((bank) => {
      setCachedUserQuestionBank(userId, bank);
      return bank;
    })
    .finally(() => {
      inFlightStore.delete(userId);
    });

  inFlightStore.set(userId, pending);
  return pending;
}

export function primeUserQuestionBank(userId: string, loader: () => Promise<QuestionBank>): Promise<QuestionBank> {
  return loadUserQuestionBank(userId, loader);
}

export function clearCachedUserQuestionBank(userId?: string) {
  const store = getStore();
  const inFlightStore = getInFlightStore();
  if (userId) {
    store.delete(userId);
    inFlightStore.delete(userId);
    return;
  }
  store.clear();
  inFlightStore.clear();
}
