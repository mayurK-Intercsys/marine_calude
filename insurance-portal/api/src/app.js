const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { loadUser } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.appUrl, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  if (config.env !== 'test') app.use(morgan('dev'));
  app.use(loadUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./modules/auth/routes'));
  app.use('/api/ref', require('./modules/reference/routes'));
  app.use('/api/verify', require('./modules/reference/verify'));
  app.use('/api/quotes', require('./modules/quotes/routes'));
  app.use('/api/policies', require('./modules/policies/routes'));
  app.use('/api/claims', require('./modules/claims/routes'));
  app.use('/api/uw', require('./modules/uw/routes'));
  app.use('/api/broker', require('./modules/broker/routes'));
  app.use('/api/admin', require('./modules/admin/routes'));
  app.use('/api/reports', require('./modules/reports/routes'));
  app.use('/api/open-covers', require('./modules/opencover/routes'));
  app.use('/api/wc', require('./modules/wc/routes'));
  app.use('/api/engineering', require('./modules/engineering/routes'));
  app.use('/api/surveys', require('./modules/surveys/routes'));
  app.use('/api/customers', require('./modules/customers/routes'));
  app.use('/api/platform', require('./modules/platform/routes'));
  app.use('/api/ui', require('./modules/ui/routes'));
  app.use('/api/engines', require('./modules/engines/routes'));
  app.use('/api/documents', require('./modules/documents/routes'));
  app.use('/api/dashboard', require('./modules/dashboard/routes'));

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
