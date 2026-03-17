const fs = require('fs');
const path = require('path');
console.log('CWD:', process.cwd());
const lines = Object.entries(process.env)
  .filter(([k]) => !k.includes('(') && !k.includes(')') && !k.includes(' '))
  .map(([k, v]) => `${k}=${v.replace(/\n/g, '\\n')}`)
  .join('\n');
fs.writeFileSync('.env', lines);
fs.writeFileSync('/app/.env', lines);
fs.writeFileSync('/app/apps/api/.env', lines);
console.log('Written .env to:', process.cwd());
console.log('DATABASE_URL present:', lines.includes('DATABASE_URL'));
