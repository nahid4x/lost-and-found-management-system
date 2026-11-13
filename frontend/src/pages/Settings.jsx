import { useTranslation } from 'react-i18next';

export default function Settings() {
  const { t, i18n } = useTranslation();
  return (
    <div className="container">
      <h1>{t('settings.title')}</h1>
      <label htmlFor="lang">{t('settings.language')}</label>
      <select
        id="lang"
        className="select"
        value={i18n.resolvedLanguage}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
      >
        <option value="en">English</option>
        <option value="bn">বাংলা</option>
      </select>
      <p className="muted">{t('settings.languageHint')}</p>
    </div>
  );
}