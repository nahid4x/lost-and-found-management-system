import mongoose from 'mongoose';

mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

export const trusted = mongoose.trusted;

export async function connectMongo(url, logger, { autoIndex = true } = {}) {
  const conn = await mongoose.connect(url, { autoIndex, serverSelectionTimeoutMS: 8000 });
  logger.info('mongo connected');
  return conn;
}
export { mongoose };
