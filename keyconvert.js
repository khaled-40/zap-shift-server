const fs = require('fs');

const json = fs.readFileSync(
  './zap-shift-d9d89-firebase-adminsdk-fbsvc-b4f6574290.json',
  'utf8'
);

const base64 = Buffer
  .from(JSON.stringify(JSON.parse(json)))
  .toString('base64')
  .replace(/\r?\n|\r/g, ''); // REMOVE ALL RETURNS

fs.writeFileSync('FB_SERVICE_KEY.txt', base64);

console.log('Length:', base64.length);
