const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    // Adjust this line if your auth service uses different claim names
    req.user = { id: String(p.id || p._id || p.sub), role: p.role || 'user' };
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Sign in again.' });
  }
}

const requireAdmin = (req, res, next) =>
  ['admin', 'moderator'].includes(req.user.role)
    ? next()
    : res.status(403).json({ error: 'Admin access required.' });

module.exports = { auth, requireAdmin };
