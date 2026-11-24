import {profileFixture} from './forest-profile-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOREST_CHARACTER_REGISTRY,FOREST_CHARACTER_IDS,FOREST_AI_SPEAKER_IDS,
  FOREST_AI_GENERATION_IDS,FOREST_ACTION_WRITING_IDS,
  FOREST_ACTORS,FOREST_REQUIRED_SPRITE_NAMES,FOREST_OPTIONAL_SPRITE_NAMES,
  FOREST_ACTOR_NAMES,FOREST_RELATIONS,
  FOREST_VOICE_ALIASES,
  FOREST_DEFAULT_VOICES,FOREST_VOICE_CHARACTERS,forestMemoryBelongsToCharacter
} from './forest-character-registry.mjs';
import {CHARACTERS} from './book-forest-world.mjs';
import {FOREST_SPRITE_NAMES,validateForestSpriteManifest} from './book-forest-drive.mjs';
import {forestVoiceProfile} from './book-forest-voice.mjs';
import {validForestCharacterProfiles} from './book-forest-character-profiles.mjs';
import {chooseForestReflectionSpotlight} from './book-forest-reflection-spotlight.mjs';

test('one canonical record drives every registered actor and AI speaker',()=>{
  assert.equal(FOREST_CHARACTER_REGISTRY.length,FOREST_CHARACTER_IDS.length);
  assert.equal(new Set(FOREST_CHARACTER_IDS).size,FOREST_CHARACTER_IDS.length);
  assert.equal(new Set(FOREST_ACTORS.map(c=>c.id)).size,FOREST_ACTORS.length);
  assert.equal(FOREST_ACTORS.length,FOREST_CHARACTER_IDS.length+1,
    'the second twin is only an extra physical actor');
  assert.deepEqual(FOREST_ACTORS,CHARACTERS);
  assert.deepEqual(FOREST_AI_SPEAKER_IDS,
    FOREST_CHARACTER_REGISTRY.filter(c=>c.mode==='ai').map(c=>c.id));
  assert.ok(FOREST_AI_GENERATION_IDS.includes('cat'));
  assert.ok(!FOREST_AI_SPEAKER_IDS.includes('cat'));
  assert.deepEqual(FOREST_ACTION_WRITING_IDS,['cat']);
  assert.equal(FOREST_CHARACTER_REGISTRY.find(x=>x.id==='cat').outputMode,'action-writing');
  assert.equal('gestureGuide' in FOREST_CHARACTER_REGISTRY.find(x=>x.id==='cat'),false,
    'the public registry must not hard-code the cat persona');
  for(const id of ['king','kiki','jiji','skipper','zorori','ishishi','noshishi','hachibee','hakase','mochan'])
    assert.ok(FOREST_AI_SPEAKER_IDS.includes(id));
  for(const character of FOREST_CHARACTER_REGISTRY){
    assert.match(character.id,/^[a-z][a-z0-9_]*$/);
    assert.ok(character.actor&&Number.isFinite(character.actor.x)&&
      Number.isFinite(character.actor.z)&&character.actor.scale>0);
    assert.ok(FOREST_ACTOR_NAMES[character.id].includes(character.id));
    for(const related of character.related||[])assert.ok(
      FOREST_CHARACTER_IDS.includes(related),character.id+' relation '+related);
    if(character.mode==='ai'){
      assert.equal('fallbackVoice' in character,false);
      assert.ok(forestVoiceProfile(character.id));
    }
  }
});

test('manifest allowlist is computed from the actor roster, never a second list',()=>{
  assert.deepEqual(FOREST_SPRITE_NAMES,FOREST_REQUIRED_SPRITE_NAMES);
  assert.deepEqual(FOREST_OPTIONAL_SPRITE_NAMES,
    FOREST_CHARACTER_REGISTRY.filter(c=>c.sprite==='optional').map(c=>c.id));
  for(const id of ['hachibee','hakase','mochan'])
    assert.ok(FOREST_OPTIONAL_SPRITE_NAMES.includes(id));
  assert.equal(FOREST_REQUIRED_SPRITE_NAMES.length,11);
  const id=i=>'abcdefghijklmno'+String(i).padStart(8,'0');
  const assets=Object.fromEntries([...FOREST_REQUIRED_SPRITE_NAMES,
    ...FOREST_OPTIONAL_SPRITE_NAMES].map((name,i)=>[name,id(i)]));
  const manifest={schemaVersion:2,columns:2,rows:2,frameSize:627,
    frameDurationMs:250,assets};
  assert.deepEqual(validateForestSpriteManifest(manifest),assets);
  assert.throws(()=>validateForestSpriteManifest({...manifest,
    assets:{...assets,unknown:id(50)}}));
});

test('canonical voice aliases include both twins and the intentionally shared brothers',()=>{
  assert.equal(FOREST_VOICE_ALIASES.twins,'twins_first');
  assert.equal(FOREST_VOICE_ALIASES.twins_second,'twins_first');
  assert.equal(FOREST_VOICE_ALIASES.noshishi,'ishishi');
  assert.deepEqual(forestVoiceProfile('noshishi'),forestVoiceProfile('ishishi'));
  assert.deepEqual(forestVoiceProfile('twins_second'),forestVoiceProfile('twins'));
  assert.equal(FOREST_VOICE_CHARACTERS.length,
    new Set(FOREST_CHARACTER_REGISTRY.filter(c=>c.voice)
      .map(c=>c.voiceId||c.id)).size);
  for(const voice of FOREST_VOICE_CHARACTERS)assert.ok(FOREST_DEFAULT_VOICES[voice.id]);
  assert.equal(forestVoiceProfile('cat'),null);
  assert.equal(forestVoiceProfile('unknown'),null);
});

test('Zukkoke friends participate in sourced daily topics and related conversations',()=>{
  const book={id:'story-z',title:'架空の探検話',status:'read'};
  const source={schemaVersion:1,id:'mem-z',bookId:book.id,
    characters:'hachibee hakase mochan',text:'三人が道を探検した。',
    tags:'探検',spoilerLevel:1,evidenceStatus:'approved',confidence:'high',
    sourceUrl:'https://example.org/story'};
  for(const id of ['hachibee','hakase','mochan']){
    assert.equal(FOREST_ACTOR_NAMES[id][1],
      {hachibee:'ハチベエ',hakase:'ハカセ',mochan:'モーちゃん'}[id]);
    assert.equal(forestMemoryBelongsToCharacter(source,id),true);
    assert.equal(FOREST_RELATIONS[id].length,2);
  }
  assert.equal(forestMemoryBelongsToCharacter(source,'cat'),false);
  assert.equal(chooseForestReflectionSpotlight({characterId:'cat',books:[book],
    reflections:[]}),null);
});

test('private character profiles are ID-gated',()=>{
  assert.ok(FOREST_CHARACTER_IDS.includes('twins'));
  assert.ok(!FOREST_CHARACTER_IDS.includes('twins_second'));
  const fields={summary:'人物像',cadence:'簡潔',firstPerson:'ぼく',avoid:'無理に説教しない'};
  assert.deepEqual(validForestCharacterProfiles([{id:'unregistered',...fields}]),[]);
  assert.equal(validForestCharacterProfiles([profileFixture({id:'hakase',...fields,
    values:'',motivation:'',relationships:'',behavior:'',reactions:'',address:'',
    endings:'',habits:'',expression:'',emotion:'',review:''})]).length,1);
});
