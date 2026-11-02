import type { Lang } from '../i18n';

/** Озвучка через Web Speech API (ТЗ: опционально). Новая фраза прерывает старую, чтобы не отставать. */
export function speak(text: string, lang: Lang): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
  u.rate = 1.15;
  synth.speak(u);
}

/** Короткая вибрация на засчитанный повтор. На iOS Vibration API нет — работает только звук/голос. */
export function buzz(ms = 40): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // не поддерживается
  }
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
