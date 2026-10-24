import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const violations=[];
for(const path of files){
  if(/^(reading-shelf\/|private\/|\.firebase\/)/.test(path))violations.push('prohibited path: '+path);
  if(/(^|\/)(?:\.env(?:\.|$)|.*\.(?:pem|p12|pfx|key)$|service-account[^/]*\.json$)/i.test(path))violations.push('possible secret file: '+path);
  if(!/\.(?:md|mjs|js|json|webmanifest|html|css|svg|gs|yml|yaml|gitignore)$/.test(path))continue;
  const body=readFileSync(path,'utf8');
  if(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\"private_key\"\s*:\s*\"-----BEGIN|ghp_[A-Za-z0-9]{20,}/.test(body))violations.push('secret material in: '+path);
  if(/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{15,}|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{15,}/.test(body))violations.push('private Sheet/GAS URL: '+path);
  if(path.startsWith('.github/workflows/')&&/google-github-actions\/auth@|id-token:\s*write/i.test(body))violations.push('production cloud authorization in public CI: '+path);
}
for(const required of ['reading-shelf-firebase/index.html','reading-shelf-firebase/firebase.json','reading-shelf-firebase/firestore.rules','reading-shelf-firebase/icon-192.png','reading-shelf-firebase/icon-512.png']){
  if(!files.includes(required))violations.push('missing required hosting file: '+required);
}
if(violations.length){console.error(violations.join('\n'));process.exitCode=1}
else console.log('PUBLIC_BOUNDARY_PASS files='+files.length);
