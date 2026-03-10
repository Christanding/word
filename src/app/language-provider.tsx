"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  translations,
  type Language,
  type TranslationKey,
} from "@/lib/i18n";

const STORAGE_KEY = "vocab-language";
const LANGUAGE_COOKIE_KEY = "vocab-language";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: React.ReactNode;
  initialLanguage: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    document.cookie = `${LANGUAGE_COOKIE_KEY}=${nextLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = translations[language] as Record<TranslationKey, string>;

    return {
      language,
      setLanguage,
      t: (key: TranslationKey) => dictionary[key],
    };
  }, [language, setLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
