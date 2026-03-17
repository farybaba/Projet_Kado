const fs = require('fs');
const lines = Object.entries(process.env)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');
fs.writeFileSync('.env', lines);
console.log('Written .env with', Object.keys(process.env).length, 'variables');
