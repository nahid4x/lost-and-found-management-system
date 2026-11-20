require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const { DIR } = require('./middleware/upload');

if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is required'); process.exit(1); }

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true, credentials: true }));
app.use(express.json({ limit: '50kb' }));

app.use('/uploads/reports', express.static(DIR, {
  maxAge: '7d', index: false, dotfiles: 'deny',
  setHeaders: (res) => { res.setHeader('Cache-Control', 'private, max-age=604800'); res.setHeader('X-Content-Type-Options', 'nosniff'); }
}));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/reports/admin', require('./routes/admin')); // must come before /:id
app.use('/api/reports', require('./routes/reports'));

app.use((err, _req, res, _next) => {
  const limit = err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT';
  const status = limit ? 400 : err.status || 500;
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be under 5 MB.'
    : err.code === 'LIMIT_FILE_COUNT' ? 'You can attach up to 3 images.'
    : status < 500 ? err.message : 'Something went wrong. Try again.';
  if (status >= 500) console.error(err);
  res.status(status).json({ error: msg });
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/findit_reports')
  .then(() => app.listen(process.env.PORT || 4100, () => console.log('report-service up')))
  .catch((e) => { console.error(e); process.exit(1); });
