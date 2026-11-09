Object.assign(process.env, {
  NODE_ENV: 'test', LOG_LEVEL: 'silent',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(16) + 'Zx9qLm3Tp7Vw2Kd8Fh5Rj1Bn4Gc6Ys0U',
  JWT_REFRESH_SECRET: 'r'.repeat(8) + 'Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lz9Xc8Vb',
  INTERNAL_SERVICE_TOKEN: 'i'.repeat(8) + 'Mn5Bv4Cx3Zl2Kj1Hg0Fd9Sa8Pq7Wo6Ei5Ru',
  CORS_ORIGINS: 'https://findit.test',
  BCRYPT_COST: '4',
});
