const config = require('./src/config');

module.exports = {
  client: 'mysql2',
  connection: {
    ...config.db,
    charset: 'utf8mb4',
    decimalNumbers: true,
    dateStrings: ['DATE'],
    timezone: 'Z',
  },
  pool: { min: 0, max: 10 },
  migrations: { directory: './src/db/migrations' },
  seeds: { directory: './src/db/seeds' },
};
