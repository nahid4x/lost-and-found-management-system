import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import bn from './bn.json';
import enMore from './en.more.json';
import bnMore from './bn.more.json';
import enReport from './en.report.json';
import bnReport from './bn.report.json';
import enAdmin from './en.admin.json';
import bnAdmin from './bn.admin.json';

// Nested object merge: pore ashar file-er key age-er key-ke override kore, kintu baki key gulo thake.
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const deepMerge = (a, b) => {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = isObj(b[k]) && isObj(a[k]) ? deepMerge(a[k], b[k]) : b[k];
  return out;
};

const merge = (...parts) => parts.reduce(deepMerge, {});

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: merge(en, enMore, enReport, enAdmin) },
    bn: { translation: merge(bn, bnMore, bnReport, bnAdmin) },
  },
  lng: localStorage.getItem('lang') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language;

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('lang', lng);
  document.documentElement.lang = lng;
});

export default i18n;