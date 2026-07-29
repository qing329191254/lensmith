import { createI18n } from "vue-i18n"
import { LOCALE_STORAGE_KEY, messages, type LocaleCode } from "./messages"

export type { LocaleCode }

function detectLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved === "zh" || saved === "en") return saved
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en"
  return nav.startsWith("zh") ? "zh" : "en"
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: "en",
  messages,
})

export function setLocale(locale: LocaleCode) {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
}

document.documentElement.lang = detectLocale() === "zh" ? "zh-CN" : "en"
