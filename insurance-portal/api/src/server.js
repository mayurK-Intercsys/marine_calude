const config = require('./config');
const { createApp } = require('./app');

createApp().listen(config.port, () => {
  console.log(`Insurance portal API listening on http://localhost:${config.port}`);
});

/**
 * Optional in-process scheduler for single-instance setups. With several API instances,
 * leave RUN_SCHEDULER unset and run `npm run jobs:daily` from one cron job instead.
 */
if (process.env.RUN_SCHEDULER === 'true') {
  const { runDaily } = require('./modules/jobs/daily');
  const run = () => runDaily().then((s) => console.log('[jobs] daily', JSON.stringify(s))).catch((e) => console.error('[jobs] failed', e));
  setTimeout(run, 10 * 1000);
  setInterval(run, 24 * 3600 * 1000);
}
