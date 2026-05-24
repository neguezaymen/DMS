import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import translationEn from '../public/locales/en/translation.json'
import translationFr from '../public/locales/fr/translation.json'

export const LANG_STORAGE_KEY = 'dms_lang'

/** Normalise tout ancien code pays / variante vers `fr` ou `en` (codes i18n de l’app). */
export function normalizeAppLanguage(raw) {
  if (raw == null || raw === '') return 'fr'
  const s = String(raw).trim().toLowerCase()
  if (s === 'gb' || s === 'en-gb' || s === 'en-us' || s.startsWith('en')) return 'en'
  if (s.startsWith('fr')) return 'fr'
  return 'fr'
}

function readInitialLanguage() {
  if (typeof localStorage === 'undefined') return 'fr'
  const raw = localStorage.getItem(LANG_STORAGE_KEY)
  const lng = normalizeAppLanguage(raw)
  if (raw != null && raw !== '' && lng !== raw) {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lng)
    } catch {
      /* ignore */
    }
  }
  return lng
}

const initPromise = i18n
  .use(initReactI18next)
  .init({
    fallbackLng: 'fr',
    lng: readInitialLanguage(),
    supportedLngs: ['fr', 'en'],
    ns: ['translation'],
    defaultNS: 'translation',
    /** Bundlé avec l’app : évite JSON obsolète (cache / ancien dist) → clés i18n affichées en dur. */
    resources: {
      fr: { translation: translationFr },
      en: { translation: translationEn },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
  .then(() => {
    i18n.on('languageChanged', (lng) => {
      try {
        const next = normalizeAppLanguage(lng)
        if (next !== lng) {
          void i18n.changeLanguage(next)
          return
        }
        localStorage.setItem(LANG_STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
    })
    return i18n
  })

export { initPromise }
export default i18n
