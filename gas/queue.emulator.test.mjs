// Public-only Stage D sandbox: fabricated family/books; never contacts production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const PROJECT='demo-reading-shelf-rules';
const HOST=process.env.FIRESTORE_EMULATOR_HOST;
if(!HOST || !/^(127\.0\.0\.1|localhost):[0-9]+$/.test(HOST))
  throw new Error('Emulator-only test: FIRESTORE_EMULATOR_HOST must be loopback.');
const BASE='http://'+HOST+'/v1/projects/'+PROJECT+'/databases/(default)/documents';
const CLOUD='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents';
const source=readFileSync(new URL('./Queue.gs',import.meta.url),'utf8');
assert.match(source,/WRITE_ENABLED:\s*false/);

function rest(method,url,body) {
  if(!url.startsWith('http://'+HOST+'/v1/projects/'+PROJECT+'/'))
    throw new Error('Refusing non-emulator network request');
  const args=['--silent','--show-error','--max-time','40','--request',method,
    '--header','Content-Type: application/json'];
  if(body!==undefined)args.push('--data-binary',JSON.stringify(body));
  args.push('--write-out','\n%{http_code}',url);
  const out=spawnSync('curl',args,{encoding:'utf8',timeout:45000});
  if(out.error||out.status!==0)
    throw new Error('curl to emulator failed: '+String(out.error||out.stderr).slice(0,180));
  const index=out.stdout.lastIndexOf('\n');
  const status=Number(out.stdout.slice(index+1));
  const raw=out.stdout.slice(0,index);
  return {status,text:raw,json:raw?JSON.parse(raw):{}};
}
function docUrl(path){return BASE+'/'+path.split('/').map(encodeURIComponent).join('/');}
function docGet(path){return rest('GET',docUrl(path));}
function seedFamily(id,name='Seed Shelf'){
  const result=rest('PATCH',docUrl('families/'+id),{fields:{
    ownerUid:{stringValue:'synthetic-owner'},
    name:{stringValue:name},
    schemaVersion:{integerValue:'1'}
  }});
  assert.equal(result.status,200,'seed family: '+result.text.slice(0,150));
}
function harness(id,initialName='Seed Shelf') {
  seedFamily(id,initialName);
  const env={familyId:id,familyPath:'families/'+id,ownerUid:'synthetic-owner'};
  let desired=initialName,confirmed=initialName, commits=0;
  const sheet={
    getRange:(...parts)=>{
      if(parts[0]==='C2')return {setValue:v=>{confirmed=v}};
      if(parts.join(',')==='1,1,2,3')return {getDisplayValues:()=>[
        ['項目','変更後の名前（入力）','確認済みの名前'],
        ['本棚名',desired,confirmed]
      ]};
      throw new Error('Unknown settings range');
    }
  };
  const ctx={
    YONDENE:{project:PROJECT,spreadsheetId:'synthetic-private-sheet'},
    yondeneSha256_:x=>createHash('sha256').update(x,'utf8').digest('hex'),
    yondeneField_:(d,k)=>{
      const f=d?.fields?.[k];
      return f?.stringValue ?? (f?.integerValue===undefined?'':Number(f.integerValue));
    },
    yondeneFirestoreRequest_:()=>{throw new Error('Unexpected legacy request')},
    UrlFetchApp:{fetch:(url,options)=>{
      if(!url.startsWith(CLOUD))throw new Error('Unexpected outbound URL');
      const local='http://'+HOST+url.slice(CLOUD.length);
      const method=String(options.method||'get').toUpperCase();
      if(method==='POST' && local.includes('documents:commit'))commits++;
      const result=rest(method,local,options.payload?JSON.parse(options.payload):undefined);
      return {getResponseCode:()=>result.status,getContentText:()=>result.text};
    }},
    Logger:{log:()=>{}},
    SpreadsheetApp:{openById:()=>({getSheetByName:x=>x==='設定'?sheet:null}),flush:()=>{}},
    Date,JSON,Math,Number,Object,String,Array,RegExp,Error,Set
  };
  vm.createContext(ctx);
  // Only a test-local evaluated copy enables writes. The public source stays OFF.
  vm.runInContext(source.replace('WRITE_ENABLED: false','WRITE_ENABLED: true'),ctx);
  const api=vm.runInContext('({begin:yondeneQueueBeginTransaction_, doc:yondeneQueueDocument_, preflight:yondeneQueuePreflight_, commit:yondeneQueueCommit_, apply:yondeneQueueApplyTransaction_, processSettings:yondeneQueueProcessSettings_, parse:yondeneQueueParse_})',ctx);
  function parsed(command){
    const cells=[command.commandId,'2026-10-24',command.op,
      JSON.stringify(command),'PENDING','','','','',''];
    return api.parse(cells);
  }
  return {api,env,parsed,setDesired:v=>{desired=v},
    getConfirmed:()=>confirmed,getCommits:()=>commits};
}
let counter=0;
function fresh(){counter++;return 'staged-family-'+counter+'-'+process.pid;}
function createCommand(bookId,title='Synthetic Adventure',isbn='9780000000116') {
  return {
    schemaVersion:1,commandId:'create-'+bookId,op:'book.create',bookId,
    book:{title,author:'Invented Writer',status:'unread',
      isbn,coverUrl:'https://example.invalid/cover.png'},
    reason:'Emulator-only concurrent uniqueness test'
  };
}

test('real emulator REST: Sheet shelf rename updates only name with durable marker',()=>{
  const id=fresh(),h=harness(id);
  h.setDesired('Revised Synthetic Shelf');
  assert.equal(h.api.processSettings('emulator-test',h.env),'APPLIED');
  assert.equal(h.getConfirmed(),'Revised Synthetic Shelf');
  const got=docGet(h.env.familyPath);
  assert.equal(got.status,200);
  assert.equal(got.json.fields.name.stringValue,'Revised Synthetic Shelf');
  assert.equal(got.json.fields.ownerUid.stringValue,'synthetic-owner');
  assert.equal(got.json.fields.schemaVersion.integerValue,'1');
  assert.equal(h.getCommits(),1);
});

test('real emulator REST: matching marker prevents replay',()=>{
  const id=fresh(),h=harness(id);
  const command=createCommand('book-once','Once Only','9780000000109');
  const p=h.parsed(command);
  assert.equal(h.api.apply('emulator-test',h.env,p),'APPLIED');
  assert.equal(h.api.apply('emulator-test',h.env,p),'ALREADY');
  assert.equal(h.getCommits(),1);
  assert.equal(docGet(h.env.familyPath+'/books/book-once').status,200);
  assert.equal(docGet(h.env.familyPath+'/chatgptMutations/'+command.commandId).status,200);
});

test('real emulator REST: duplicate ISBN and title author reject a second book',()=>{
  const id=fresh(),h=harness(id);
  const a=h.parsed(createCommand('book-first','Repeated Synthetic','9780000000031'));
  const b=h.parsed(createCommand('book-second','Repeated Synthetic','9780000000031'));
  assert.equal(h.api.apply('emulator-test',h.env,a),'APPLIED');
  assert.throws(()=>h.api.apply('emulator-test',h.env,b),/同名・同著者|ISBN/);
  assert.equal(docGet(h.env.familyPath+'/books/book-second').status,404);
  assert.equal(docGet(h.env.familyPath+'/chatgptMutations/create-book-second').status,404);
});

test('real emulator REST: concurrent same logical key allows no double commit',()=>{
  const id=fresh(),h=harness(id);
  const a=h.parsed(createCommand('race-a','Concurrent Synthetic','9780000000048'));
  const b=h.parsed(createCommand('race-b','Concurrent Synthetic','9780000000048'));
  const ta=h.api.begin('emulator-test');
  const tb=h.api.begin('emulator-test');
  const familyA=h.api.doc('emulator-test',h.env.familyPath,ta);
  const familyB=h.api.doc('emulator-test',h.env.familyPath,tb);
  const planA=h.api.preflight('emulator-test',h.env,familyA,a,ta);
  const planB=h.api.preflight('emulator-test',h.env,familyB,b,tb);
  assert.equal(h.api.commit('emulator-test',h.env,a,planA,ta),'APPLIED');
  assert.throws(()=>h.api.commit('emulator-test',h.env,b,planB,tb),/Firestore commit HTTP/);
  const docs=[docGet(h.env.familyPath+'/books/race-a'),
    docGet(h.env.familyPath+'/books/race-b')];
  assert.equal(docs.filter(x=>x.status===200).length,1);
});
