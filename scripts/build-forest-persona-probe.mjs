// Run from the repository root. This writes public code only, never live rows.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const output='gas/ForestPersonaProbe.gs';
execFileSync('npx',['--yes','esbuild@0.25.12','gas/ForestPersonaProbe.mjs','--bundle',
  '--format=iife','--global-name=ForestPersonaProbe','--target=es2020','--outfile='+output],{stdio:'inherit'});
writeFileSync(output,readFileSync(output,'utf8')+'\nfunction yondeneGemmaTestProcessQueue(){return ForestPersonaProbe.processQueue();}\nfunction yondeneGemmaTestRunPendingNow(){return ForestPersonaProbe.processQueue({maxCases:5});}\n');
