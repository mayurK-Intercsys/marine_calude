const knex = require('knex');
const knexfile = require('../../knexfile');

const db = knex(knexfile);

/** MySQL JSON columns need a string on write; mysql2 parses them on read. */
const json = (value) => (value === undefined ? undefined : JSON.stringify(value ?? null));

module.exports = { db, json };
