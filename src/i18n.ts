import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import tr from './locales/tr.json'
import en from './locales/en.json'

const resources = {
  tr: { translation: tr },
  en: { translation: en },
}

void i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('data-lens-language') ?? 'tr',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (language) => localStorage.setItem('data-lens-language', language))

export default i18n
