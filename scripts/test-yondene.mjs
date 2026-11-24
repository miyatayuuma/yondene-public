import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const cwd=fileURLToPath(new URL('../',import.meta.url));
function run(args){
  const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
const tests=directory=>readdirSync(new URL('../'+directory+'/',import.meta.url))
  .filter(name=>name.endsWith('.test.mjs')&&name!=='firestore.rules.test.mjs')
  .map(name=>directory+'/'+name);

run(['scripts/build-forest-persona-probe.mjs']);
run(['--test',...tests('reading-shelf-firebase'),...tests('gas'),...tests('cloudflare/forest-ai/src')]);
