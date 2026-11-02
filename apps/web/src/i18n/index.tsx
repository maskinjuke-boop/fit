import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { ru, type Dict } from './ru';

export type Lang = 'ru' | 'en';
export type I18nKey = keyof Dict;

const DICTS: Record<Lang, Dict> = { ru, en };

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('fitness-rpg.lang');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // нет доступа к хранилищу
  }
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

interface I18n {
  lang: Lang;
  setLang(l: Lang): void;
  t(key: I18nKey): string;
  /** Текст с подстановками: tf('ev.levelUp', { n: 5 }). */
  tf(key: I18nKey, vars: Record<string, string | number>): string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('fitness-rpg.lang', l);
    } catch {
      // нет доступа к хранилищу
    }
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (k) => DICTS[lang][k],
      tf: (k, vars) => DICTS[lang][k].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? '')),
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
