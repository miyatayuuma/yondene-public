import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderForestVoiceLab} from './forest-voice-lab-source.mjs';

const relative=file=>fileURLToPath(new URL(file,import.meta.url));
const html=renderForestVoiceLab(
  readFileSync(relative('./forest-voice-lab.template.html'),'utf8'),
  readFileSync(relative('../reading-shelf-firebase/forest-character-registry.mjs'),'utf8'),
  readFileSync(relative('../reading-shelf-firebase/book-forest-voice.mjs'),'utf8'),
  readFileSync(relative('./forest-voice-lab-ui.js'),'utf8'));
const out=relative('../reading-shelf-firebase/forest-voice-lab.html');
writeFileSync(out,html,'utf8');
process.stdout.write('Generated self-contained forest-voice-lab.html from shared registry\n');
