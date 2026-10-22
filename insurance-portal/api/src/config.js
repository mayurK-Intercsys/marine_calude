require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  jwtTtlHours: 12,
  devOtpEcho: env !== 'production' && process.env.DEV_OTP_ECHO !== 'false',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'portal',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'insurance_portal',
  },
};

if (env === 'production' && config.jwtSecret === 'dev-only-secret') {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = config;
