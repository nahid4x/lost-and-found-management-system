// Keep categories in sync with services/report-service/src/categories.js
export const CATEGORIES = {
  fake_post:     { label: 'Fake or spam post',       hint: 'Fake, duplicate or advertising posts', subs: ['Fake item', 'Duplicate post', 'Advertisement', 'Irrelevant content'] },
  fraud_claim:   { label: 'Fraudulent claim',        hint: 'Someone claiming an item that is not theirs', subs: ['False ownership', 'Claiming a stolen item', 'Fake proof'] },
  harassment:    { label: 'Harassment or abuse',     hint: 'Abusive chat, threats, hate speech', subs: ['Abusive messages', 'Threats', 'Hate speech'] },
  inappropriate: { label: 'Inappropriate content',   hint: 'Adult, violent or offensive content', subs: ['Adult content', 'Violent content', 'Offensive image'] },
  privacy:       { label: 'Privacy issue',           hint: 'Personal details shown without consent', subs: ['ID or document exposed', 'Phone or address exposed', 'Photo of me without consent'] },
  scam:          { label: 'Scam or suspicious user', hint: 'Money requests, phishing, impersonation', subs: ['Asking for money', 'Phishing link', 'Impersonation'] },
  wrong_info:    { label: 'Wrong information',       hint: 'Wrong location, category or outdated post', subs: ['Wrong location', 'Wrong category', 'Outdated post'] },
  bug:           { label: 'Bug or technical issue',  hint: 'Something in the app is not working', subs: ['App error', 'Upload failed', 'Notification problem', 'Other bug'] },
  other:         { label: 'Something else',          hint: 'Anything that does not fit above', subs: ['Other'] }
};

export const STATUS_META = {
  submitted:    { label: 'Submitted',              tone: 'neutral' },
  under_review: { label: 'Under review',           tone: 'info' },
  needs_info:   { label: 'More information needed', tone: 'warn' },
  resolved:     { label: 'Resolved',               tone: 'ok' },
  rejected:     { label: 'Closed without action',  tone: 'muted' }
};

export const fmtDate = (d) =>
  new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
