/** Cron entry point: `npm run jobs:daily` (e.g. 02:00 daily). */
const { runDaily } = require('../src/modules/jobs/daily');
const { db } = require('../src/db');

runDaily({ asOf: process.argv[2] })
  .then((summary) => { console.log(JSON.stringify(summary, null, 2)); })
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.destroy());
