import { useTranslation } from 'react-i18next';
import { EmailSection, PasswordSection, DeleteSection } from '../components/AccountSections.jsx';

export default function Settings() {
  const { t, i18n } = useTranslation();
  return (
    <div className="container">
      <h1>{t('settings.title')}</h1>

      <div className="col" style={{ gap: 20, maxWidth: 720, marginTop: 20 }}>
        <section className="glass" style={{ padding: 20 }}>
          <label htmlFor="lang" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
            {t('settings.language')}
          </label>
          <select
            id="lang"
            className="select"
            value={i18n.resolvedLanguage}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
          </select>
          <p className="muted" style={{ marginTop: 8 }}>{t('settings.languageHint')}</p>
        </section>

        <EmailSection />
        <PasswordSection />
        <DeleteSection />
      </div>
    </div>
  );
}