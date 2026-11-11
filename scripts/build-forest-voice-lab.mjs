import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const relative=file=>fileURLToPath(new URL(file,import.meta.url));
const template=readFileSync(relative('./forest-voice-lab.template.html'),'utf8');
const engine=readFileSync(relative('../reading-shelf-firebase/book-forest-voice.mjs'),'utf8')
  .replace(/^export /gm,'');
const ui=readFileSync(relative('./forest-voice-lab-ui.js'),'utf8');
const html=template.replace('/* FOREST_VOICE_ENGINE */',engine)
  .replace('/* FOREST_VOICE_LAB_UI */',ui);
if(html===template||html.includes('/* FOREST_VOICE_ENGINE */')||html.includes('/* FOREST_VOICE_LAB_UI */')){
  throw new Error('Voice lab template placeholders were not replaced');
}
const out=relative('../reading-shelf-firebase/forest-voice-lab.html');
writeFileSync(out,html,'utf8');
process.stdout.write('Generated self-contained forest-voice-lab.html\n');
