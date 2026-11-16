// The voice lab is a single offline HTML file. Embed the same canonical
// registry and voice engine as the app instead of preserving a second roster.
const ENGINE_HEADER=[
  "import {FOREST_VOICE_CHARACTERS,FOREST_VOICE_ALIASES,",
  "  FOREST_DEFAULT_VOICES} from './forest-character-registry.mjs';",
  "export {FOREST_VOICE_CHARACTERS,FOREST_VOICE_ALIASES,FOREST_DEFAULT_VOICES};",
  ""
].join('\n');

export function renderForestVoiceLab(template,registrySource,engineSource,ui){
  if(!engineSource.startsWith(ENGINE_HEADER))
    throw Error('Voice engine no longer imports the shared registry as expected');
  const registry=registrySource.replace(/^export /gm,'');
  const engine=engineSource.slice(ENGINE_HEADER.length).replace(/^export /gm,'');
  if(/^\s*(?:import|export)\s/um.test(registry+'\n'+engine))
    throw Error('Standalone voice lab cannot contain module imports/exports');
  const html=template.replace('/* FOREST_VOICE_ENGINE */',registry+'\n'+engine)
    .replace('/* FOREST_VOICE_LAB_UI */',ui);
  if(html===template||html.includes('/* FOREST_VOICE_ENGINE */')||
    html.includes('/* FOREST_VOICE_LAB_UI */'))
    throw Error('Voice lab template placeholders were not replaced');
  return html;
}
