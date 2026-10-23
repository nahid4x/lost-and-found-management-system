export class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const badRequest = (m = 'Bad request', c) => new AppError(400, m, c);
export const unauthorized = (m = 'Authentication required') => new AppError(401, m, 'unauthorized');
export const forbidden = (m = 'Forbidden') => new AppError(403, m, 'forbidden');
export const notFound = (m = 'Not found') => new AppError(404, m, 'not_found');
export const conflict = (m = 'Conflict', c) => new AppError(409, m, c);
export const tooMany = (m = 'Too many requests') => new AppError(429, m, 'rate_limited');

export function notFoundHandler(_req, _res, next) {
  next(notFound('Route not found'));
}

/** Generic client messages; details only in server logs; never a stack trace. */
export function errorHandler(logger) {
  return (err, req, res, _next) => {
    if (res.headersSent) return;
    let status = 500;
    let message = 'Internal server error';
    let code = 'internal';
    let details;
    if (err instanceof AppError) {
      ({ status, message, code } = err);
    } else if (err?.name === 'ZodError') {
      status = 400; message = 'Invalid input'; code = 'validation';
      details = err.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));
    } else if (err?.type === 'entity.too.large') {
      status = 413; message = 'Payload too large'; code = 'too_large';
    } else if (err?.type === 'entity.parse.failed') {
      status = 400; message = 'Malformed JSON'; code = 'bad_json';
    } else if (err?.name === 'CastError' || err?.name === 'ValidationError') {
      status = 400; message = 'Invalid input'; code = 'validation';
    } else if (err?.name === 'MulterError') {
      status = 400; message = 'Upload rejected'; code = 'upload';
    } else if (err?.code === 11000) {
      status = 409; message = 'Already exists'; code = 'duplicate';
    }
    if (status >= 500) logger.error('request failed', { reqId: req.id, path: req.path, err });
    res.status(status).json({ error: { message, code, ...(details ? { details } : {}) } });
  };
}
