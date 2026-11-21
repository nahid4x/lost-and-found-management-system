import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, AlertCircle, Camera, Mail } from 'lucide-react';
import { useAuth } from '../context/Auth.jsx';
import { api } from '../lib/api.js';
import { errMsg, initials } from '../lib/util.js';
import { Msg, F, Submit, longDate, daysLeft } from '../components/AccountSections.jsx';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const dirty = name.trim() !== user.name || bio.trim() !== (user.bio || '');
  const nameInvalid = editing && name.trim().length < 2;

  async function save(e) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true); setMsg(null);
    try {
      const d = await api.patch('/auth/me', { name: name.trim(), bio: bio.trim() });
      updateUser(d.user);
      setEditing(false);
      setMsg({ type: 'ok', text: t('profile.updated') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  async function onAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type)) return setMsg({ type: 'err', text: t('profile.useImage') });
    if (file.size > MAX_BYTES) return setMsg({ type: 'err', text: t('profile.imgSmall') });
    setBusy(true); setMsg(null);
    try {
      const d = await api.uploadRaw('/auth/me/avatar', file);
      updateUser(d.user);
      setMsg({ type: 'ok', text: t('profile.picUpdated') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  async function removeAvatar() {
    setBusy(true); setMsg(null);
    try {
      const d = await api.del('/auth/me/avatar');
      updateUser(d.user);
      setMsg({ type: 'ok', text: t('profile.picRemoved') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  async function cancelDeletion() {
    setBusy(true); setMsg(null);
    try {
      const d = await api.post('/auth/me/delete/cancel');
      updateUser(d.user);
      setMsg({ type: 'ok', text: t('profile.delCancelled') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  function cancelEdit() { setEditing(false); setName(user.name); setBio(user.bio || ''); setMsg(null); }

  return (
    <div className="container profile-page">
      <div>
        <h1>{t('profile.title')}</h1>
        <p className="muted">{t('profile.subtitle')}</p>
      </div>

      {user.deletionScheduledFor && (
        <div className="profile-banner" role="alert">
          <div>
            <strong>{t('profile.delBanner', { date: longDate(user.deletionScheduledFor, i18n.language) })}</strong>
            <p className="small" style={{ margin: '4px 0 0' }}>{t('profile.daysLeft', { count: daysLeft(user.deletionScheduledFor) })}</p>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={cancelDeletion}>{t('profile.cancelDeletion')}</button>
        </div>
      )}

      <Msg m={msg} />

      <section className="glass pad profile-head">
        <div className="profile-avatar-wrap">
          <div className="avatar profile-avatar">
            {user.avatarUrl ? <img src={user.avatarUrl} alt={t('profile.avatarAlt', { name: user.name })} /> : initials(user.name)}
          </div>
          <button type="button" className="icon-btn profile-cam" aria-label={t('profile.changePhoto')} disabled={busy} onClick={() => fileRef.current?.click()}><Camera size={16} /></button>
          <input ref={fileRef} type="file" accept={TYPES.join(',')} hidden onChange={onAvatar} />
        </div>
        <div className="profile-meta">
          <h2>{user.name}</h2>
          <p className="muted">
            {user.email}
            {user.emailVerified ? (
              <span className="fi-verify-badge ok"><BadgeCheck size={14} /> {t('profile.verified', { defaultValue: 'Verified' })}</span>
            ) : (
              <span className="fi-verify-badge no"><AlertCircle size={14} /> {t('profile.notVerified', { defaultValue: 'Not verified' })}</span>
            )}
          </p>
          <p className="faint small">{t('profile.memberSince', { date: longDate(user.createdAt, i18n.language) })}</p>
          {user.avatarUrl && (
            <div className="row">
              <button type="button" className="btn sm" disabled={busy} onClick={removeAvatar}>{t('profile.removePhoto')}</button>
            </div>
          )}
          <p className="hint" style={{ margin: '8px 0 0' }}>{t('profile.photoHint')}</p>
        </div>
      </section>

      {!user.emailVerified && (
        <div className="profile-verify" role="status">
          <span className="ico-row"><Mail size={16} /> {t('profile.verifyBanner', { defaultValue: 'Your email address is not verified yet.' })}</span>
          <Link to="/verify-email" className="btn sm primary">{t('profile.verifyNow')}</Link>
        </div>
      )}

      <form className="glass pad col" onSubmit={save} noValidate>
        <div className="row">
          <h2 style={{ margin: 0 }}>{t('profile.personal')}</h2>
          <span className="spacer" />
          {!editing && <button type="button" className="btn sm" onClick={() => { setEditing(true); setMsg(null); }}>{t('profile.editProfile')}</button>}
        </div>

        <F id="p-name" label={t('profile.fullName')} value={name} onChange={(e) => setName(e.target.value)} disabled={!editing || busy} maxLength={60} error={nameInvalid ? t('profile.nameMin') : ''} />
        <F id="p-email" label={t('profile.email')} value={user.email} disabled readOnly hint={t('profile.emailHint')} />

        <div className="field">
          <label htmlFor="p-bio">{t('profile.bio')}</label>
          <textarea id="p-bio" className="textarea" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} disabled={!editing || busy} maxLength={280} />
          <span className="hint">{bio.length}/280</span>
        </div>

        {editing && (
          <div className="row">
            <Submit busy={busy} disabled={!dirty || nameInvalid}>{busy ? t('profile.saving') : t('profile.save')}</Submit>
            <button type="button" className="btn" disabled={busy} onClick={cancelEdit}>{t('common.cancel')}</button>
          </div>
        )}
      </form>
    </div>
  );
}