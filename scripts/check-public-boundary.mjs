// Review tracked files before publishing. This checks the CURRENT checkout;
// Git history, PR comments, Actions logs and third-party asset rights need
// separate review before starting a new public repository.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'})
  .split('\0').filter(Boolean);
const errors=[];
const approvedBinaries=new Set([
  "reading-shelf-firebase/forest-assets/hall.glb",
  "reading-shelf-firebase/forest-assets/house.glb",
  "reading-shelf-firebase/forest-assets/nature/flower-purplea.glb",
  "reading-shelf-firebase/forest-assets/nature/flower-reda.glb",
  "reading-shelf-firebase/forest-assets/nature/flower-yellowa.glb",
  "reading-shelf-firebase/forest-assets/nature/grass-large.glb",
  "reading-shelf-firebase/forest-assets/nature/grass.glb",
  "reading-shelf-firebase/forest-assets/nature/log-large.glb",
  "reading-shelf-firebase/forest-assets/nature/mushroom-redgroup.glb",
  "reading-shelf-firebase/forest-assets/nature/plant-bushdetailed.glb",
  "reading-shelf-firebase/forest-assets/nature/rock-largea.glb",
  "reading-shelf-firebase/forest-assets/nature/rock-largeb.glb",
  "reading-shelf-firebase/forest-assets/nature/stump-old.glb",
  "reading-shelf-firebase/forest-assets/nature/tree-default.glb",
  "reading-shelf-firebase/forest-assets/nature/tree-detailed.glb",
  "reading-shelf-firebase/forest-assets/nature/tree-oak.glb",
  "reading-shelf-firebase/forest-assets/nature/tree-pinedefaulta.glb",
  "reading-shelf-firebase/icon-192.png",
  "reading-shelf-firebase/icon-512.png"
]);
const textFile=/\.(?:md|mjs|js|json|webmanifest|html|css|svg|gs|yml|yaml|toml|txt|py|sh|rules)$/iu;
const forbiddenPath=/(^|\/)(?:private|reading-shelf|\.firebase|\.env(?:\.[^/]*)?|\.secrets?|credentials?)(\/|$)|(^|\/)(?:service[-_]?account[^/]*\.json|[^/]+\.(?:pem|p12|pfx|key|keystore|sqlite|db|csv|tsv|xlsx?|pdf|zip|tar|gz|log))$/iu;
const privateLink=/(?:docs\.google\.com\/spreadsheets\/d\/|script\.google\.com\/macros\/s\/)[A-Za-z0-9_-]{15,}/iu;
const privateKey=/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|["']private_key["']\s*:\s*["']-----BEGIN/iu;
const accessToken=/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,}|sk-[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9_-]{25,})\b/u;
const hardcodedPrivateFileId=/(?:const|let|var)\s+[A-Z0-9_]*(?:MANIFEST|SHEET|DRIVE|FOLDER|SPRITE)[A-Z0-9_]*_ID\s*=\s*["'][A-Za-z0-9_-]{20,}["']/iu;
const longCredential=/(?:password|passwd|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_+/=.:-]{24,}["']/iu;
const email=/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/gu;
const emailDomainAllowed=domain=>
  /^(?:example\.(?:com|org|net)|[A-Za-z0-9.-]+\.test|system\.gserviceaccount\.com)$/iu.test(domain);

for(const path of files){
  if(forbiddenPath.test(path))errors.push('prohibited path: '+path);
  if(approvedBinaries.has(path))continue;
  if(!textFile.test(path)&&path!=='.gitignore'){
    errors.push('unreviewed binary or file extension: '+path);
    continue;
  }
  const source=readFileSync(path,'utf8');
  if(privateKey.test(source)||accessToken.test(source)||longCredential.test(source))
    errors.push('potential private credential in: '+path);
  if(privateLink.test(source))
    errors.push('private Sheets / GAS URL in: '+path);
  if(hardcodedPrivateFileId.test(source))
    errors.push('hard-coded private resource ID in: '+path);
  // Firebase's browser apiKey is a public client identifier. Other Google
  // API keys need a review, even if they share the same "AIza" prefix.
  if(path!=='reading-shelf-firebase/firebase-config.mjs'&&/AIza[A-Za-z0-9_-]{30,}/u.test(source))
    errors.push('Google API key outside public Firebase client config: '+path);
  for(const match of source.matchAll(email)){
    if(!emailDomainAllowed(match[1]))errors.push('non-synthetic email in: '+path);
  }
  if(path.startsWith('.github/workflows/')&&
    /google-github-actions\/auth@|id-token:\s*write/iu.test(source))
    errors.push('cloud write identity in public CI: '+path);
}
for(const path of ['reading-shelf-firebase/index.html',
  'reading-shelf-firebase/firebase.json',
  'reading-shelf-firebase/firestore.rules',
  'reading-shelf-firebase/icon-192.png',
  'reading-shelf-firebase/icon-512.png']){
  if(!files.includes(path))errors.push('missing application file: '+path);
}
if(errors.length){
  console.error([...new Set(errors)].join('\n'));
  process.exitCode=1;
}else{
  console.log('PUBLIC_BOUNDARY_PASS files='+files.length);
}
