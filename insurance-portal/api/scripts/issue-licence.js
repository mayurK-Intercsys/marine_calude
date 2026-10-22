/**
 * Vendor tool: node scripts/issue-licence.js "Insurer name" 2027-12-31 300 FIRE,MARINE,WC,ENGINEERING,B2C,B2B,REPORTS,API
 * Requires the same LICENCE_SECRET as the installation.
 */
const { sign, MODULES } = require('../src/lib/licence');

const [licensee, validTo, seats, modules] = process.argv.slice(2);
if (!licensee || !validTo || !seats) {
  console.error('Usage: issue-licence.js <licensee> <validTo YYYY-MM-DD> <maxUsers> [modules comma list]');
  process.exit(1);
}
const payload = { licenceId: `LIC-${Date.now()}`, licensee, validFrom: new Date().toISOString().slice(0, 10), validTo, maxUsers: Number(seats), graceDays: 15, modules: modules ? modules.split(',') : MODULES };
console.log(sign(payload));
