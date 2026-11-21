// Keep in sync with frontend/src/pages/reports/reportUtils.js
const CATEGORIES = {
  fake_post:      { label: 'Fake or spam post',      subs: ['Fake item', 'Duplicate post', 'Advertisement', 'Irrelevant content'] },
  fraud_claim:    { label: 'Fraudulent claim',       subs: ['False ownership', 'Claiming a stolen item', 'Fake proof'] },
  harassment:     { label: 'Harassment or abuse',    subs: ['Abusive messages', 'Threats', 'Hate speech'] },
  inappropriate:  { label: 'Inappropriate content',  subs: ['Adult content', 'Violent content', 'Offensive image'] },
  privacy:        { label: 'Privacy issue',          subs: ['ID or document exposed', 'Phone or address exposed', 'Photo of me without consent'] },
  scam:           { label: 'Scam or suspicious user',subs: ['Asking for money', 'Phishing link', 'Impersonation'] },
  wrong_info:     { label: 'Wrong information',      subs: ['Wrong location', 'Wrong category', 'Outdated post'] },
  bug:            { label: 'Bug or technical issue', subs: ['App error', 'Upload failed', 'Notification problem', 'Other bug'] },
  other:          { label: 'Something else',         subs: ['Other'] }
};
const TARGET_TYPES = ['item', 'claim', 'user', 'message', 'general'];
const STATUSES = ['submitted', 'under_review', 'needs_info', 'resolved', 'rejected'];
const PRIORITIES = ['low', 'medium', 'high'];
module.exports = { CATEGORIES, TARGET_TYPES, STATUSES, PRIORITIES };
