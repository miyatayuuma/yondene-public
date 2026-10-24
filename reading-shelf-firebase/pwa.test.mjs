import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STATUSES,readingModeLabel,compactReadPeriodLabel} from './domain.mjs';
import {coverStatusLabel,coverIsAlternate} from './bibliography-identity.mjs';
const get=(name)=>readFileSync(new URL('./'+name,import.meta.url));
const text=(name)=>get(name).toString('utf8');
const manifest=JSON.parse(text('manifest.webmanifest'));

test('installable Japanese よんでね PWA manifest',()=>{
  assert.equal(manifest.name,'よんでね');
  assert.equal(manifest.short_name,'よんでね');
  assert.equal(manifest.lang,'ja');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  for(const size of [192,512]){
    const name='icon-'+size+'.png';
    assert.ok(manifest.icons.some(i=>i.src==='/'+name&&i.sizes===size+'x'+size&&i.type==='image/png'));
    const buf=get(name);
    assert.deepEqual([...buf.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(buf.toString('ascii',12,16),'IHDR');
    assert.equal(buf.readUInt32BE(16),size);
    assert.equal(buf.readUInt32BE(20),size);
  }
  assert.match(text('icon.svg'),/<svg /);
});
test('read-only library has no book editors, imports, or upload controls',()=>{
  const html=text('index.html'),js=text('app.mjs');
  assert.match(html,/よんでね/);
  assert.match(html,/manifest\.webmanifest/);
  assert.match(html,/id="bookInfoDialog"/);
  assert.match(html,/読んだ本/);
  assert.match(html,/<span>シリーズ<\/span>/);
  for(const forbidden of ['bookForm','bookDialogTitle','removeBook','addBook','bookInfoEdit','createFamily','importData','importReadingPeriods','openEditor','saveEditor','exportData']){
    assert.ok(!html.includes(forbidden)&&!js.includes(forbidden),forbidden+' must not be in PWA UI');
  }
});
test('only static app files are cached; user records remain Firebase-only',()=>{
  const sw=text('sw.js');
  assert.match(sw,/caches\.open/);
  assert.match(sw,/url\.origin!==self\.location\.origin/);
  assert.ok(!sw.includes('firestore.googleapis.com'));
  assert.ok(!sw.includes('accounts.google.com'));
  assert.match(text('app.mjs'),/serviceWorker\.register\('\/sw\.js',\{updateViaCache:'none'\}\)/);
});
test('browser rules deny book create/delete and allow only guarded owner reading updates',()=>{
  const rules=text('firestore.rules');
  for(const path of ['books','series']){
    const x=rules.match(new RegExp('match \\/'+path+'\\/\\{[^}]+\\} \\{([\\s\\S]*?)\\n      \\}'));
    assert.ok(x,'rules missing for '+path);
    assert.match(x[1],/allow get, list: if member\(fid\);/);
    if(path==='books'){assert.match(x[1],/allow create, delete: if false;/);assert.match(x[1],/allow update: if validReadingBookEdit\(fid,bookId\);/)}
    else assert.match(x[1],/allow create, update, delete: if false;/);
  }
});

test('install button is connected to a real browser install event',()=>{
  const html=text('index.html'),js=text('app.mjs');
  assert.match(html,/id="installApp"[^>]*hidden/);
  assert.match(js,/beforeinstallprompt/);
  assert.match(js,/appinstalled/);
  assert.match(js,/await prompt\.prompt\(\)/);
});
test('series is not counted solely by completed series',()=>{
  const js=text('app.mjs');
  assert.match(js,/\$\('seriesCount'\)\.textContent=series\.length/);
  assert.match(js,/if\(!book\.seriesId\)continue/);
});

test('new family interaction surfaces preserve chat-only formal record editing',()=>{
  const html=text('index.html'),app=text('app.mjs'),rules=text('firestore.rules');
  assert.match(html,/data-view="recommendations"/);
  assert.match(html,/id="familySettings"/);
  assert.match(html,/id="sort" aria-label="並び順"/);
  assert.match(html,/id="filter" aria-label="表示する本"/);
  assert.doesNotMatch(html,/id="sortDirection"|id="timelineToggle"/);
  assert.doesNotMatch(app,/sortDirection|timelineToggle|sortDescending/);
  assert.match(app,/mountBookCommunity/);
  assert.match(app,/mountRecommendations/);
  for(const collection of ['comments','reactions','requests','childReflections','recommendations']){
    assert.ok(rules.includes('match /'+collection+'/'),collection+' must have a Firestore access rule');
  }
  assert.doesNotMatch(html,/id="bookForm"/);
});


test('no removed DOM ID can silently cause a null property assignment',()=>{
  const html=text('index.html'),app=text('app.mjs');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const references=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
  assert.ok(references.length>20);
  for(const id of references)assert.ok(ids.has(id),'app references missing DOM element: '+id);
  assert.ok(!app.includes("$('familyTab')"),'removed family tab cannot be accessed');
});
test('PWA cannot combine stale JS with current HTML after deployment',()=>{
  const html=text('index.html'),sw=text('sw.js');
  const config=JSON.parse(text('firebase.json'));
  assert.match(html,/app\.mjs\?build=20261019-shelf-v28/);
  assert.match(sw,/const ARTWORK_PATHS=new Set\(ARTWORK\)/);
  assert.ok(!sw.includes('PUBLIC_ASSETS'));
  for(const path of ['/app.mjs','/index.html','/domain.mjs','/book-community.mjs','/recommendations.mjs']){
    assert.ok(!sw.includes("'"+path+"'"),path+' must not be service-worker-cached');
  }
  for(const source of ['/', '**/*.html','**/*.mjs','**/*.css','/sw.js']){
    assert.ok(config.hosting.headers.some(h=>h.source===source&&h.headers.some(k=>k.key==='Cache-Control'&&k.value==='no-store')),source);
  }
});

test('family-facing copy consistently identifies 管理者, not ChatGPT',()=>{
  const app=text('app.mjs'),community=text('book-community.mjs'),html=text('index.html');
  assert.doesNotMatch(app,/ChatGPT/);
  assert.doesNotMatch(community,/ChatGPT/);
  assert.doesNotMatch(html,/ChatGPT/);
  assert.match(app,/本の登録・修正・削除は管理者が行います。/);
  assert.match(app,/mountReadingRecordEditor/);
  assert.match(text('firestore.rules'),/match \/readingEditEvents\//);
  assert.match(community,/感想はまだありません。/);
});
test('book detail exposes conversation before collapsed complete catalog data',()=>{
  const app=text('app.mjs'),css=text('style.css');
  const start=app.indexOf('function openBookInfo(book');
  const end=app.indexOf('function renderRecommendations()',start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  assert.ok(block.indexOf('mountBookCommunity(')<block.indexOf('root.append(disclosure)'), 'social section precedes catalog');
  assert.match(block,/document\.createElement\('details'\)/);
  assert.match(block,/ISBN/);
  assert.match(block,/読書・観察メモ/);
  assert.match(block,/dialog\.scrollTop=0/);
  assert.match(css,/#bookInfoDialog \.dialogTop/);
  assert.match(css,/position:sticky/);
});

test('single-step sorting options have distinct clear Japanese descriptions',()=>{
  const html=text('index.html'),app=text('app.mjs');
  for(const [key,label] of [
    ['order-new','最近読んだ順'],
    ['order-old','最初に読んだ順'],
    ['title-asc','タイトル順'],
    ['author-asc','作者順'],
    ['year-new','出版年：新しい順'],
    ['year-old','出版年：古い順']
  ]){
    assert.ok(html.includes('<option value="'+key+'">'+label+'</option>'),key);
  }
  assert.ok(html.includes('<option value="active-read">読んでる・読んだ</option>'));
  assert.doesNotMatch(html,/<option value="(?:reading|timeline|read)">/);
  assert.doesNotMatch(app,/periodMode|readPeriodGrouping/);
  assert.match(app,/filter:view==='series'\?'all':\$\('filter'\)\.value/);
  assert.match(app,/sort:\$\('sort'\)\.value/);
});
test('PWA build matches all local module edges and cannot silently run old domain labels',()=>{
  const html=text('index.html'),app=text('app.mjs'),recs=text('recommendations.mjs');
  const build='20261019-shelf-v28';
  assert.match(html,new RegExp('data-app-build="'+build+'"'));
  assert.match(html,new RegExp('app\\.mjs\\?build='+build));
  assert.match(html,new RegExp('style\\.css\\?build='+build));
  assert.match(app,new RegExp("const APP_BUILD='"+build+"'"));
  assert.match(app,/document\.documentElement\.dataset\.appBuild!==APP_BUILD/);
  for(const module of ['domain','book-community','recommendations','bibliography-identity','firebase-config','activity','invite-links','cover-thumbnails','nickname','reader-name','pending-reflections','startup-recovery']){
    assert.ok(app.includes("'./"+module+".mjs?build="+build+"'"),'versioned import: '+module);
  }
  assert.ok(recs.includes("'./domain.mjs?build="+build+"'"));
  assert.ok(app.includes("'./child-rating.mjs?build="+build+"'"));
  assert.ok(text('book-community.mjs').includes("'./reflection-withdrawal.mjs?build="+build+"'"));
  assert.doesNotMatch(app,/ChatGPT|sortDirection|timelineToggle/);
  assert.match(app,/アプリのバージョン：/);
});

test('bookshelf cards separate reading attributes from publication metadata',()=>{
  const app=text('app.mjs'),domain=text('domain.mjs');
  const card=app.slice(app.indexOf('function bookGrid(data){'),app.indexOf('function openBookInfo('));
  assert.match(card,/readingModeLabel\(b\)/);
  assert.match(card,/compactReadPeriodLabel\(b\)/);
  assert.match(card,/b\.publicationYear/);
  assert.doesNotMatch(card,/b\.ageLabel/);
  assert.match(domain,/export function readingModeLabel/);
});
test('recent family activity uses one limited live listener, no all-book fanout',()=>{
  const app=text('app.mjs'),activity=text('activity.mjs'),rules=text('firestore.rules');
  assert.match(app,/mountFamilyActivity/);
  assert.match(activity,/orderBy\('createdAt','desc'\),limit\(count\)/);
  assert.match(rules,/match \/activity\/\{activityId\}/);
  const community=text('book-community.mjs'),recs=text('recommendations.mjs');
  assert.match(community,/batch\.set\(activityFor\(ref\.id\)/);
  assert.match(recs,/batch\.set\(activityFor\(recRef\.id\)/);
});
test('optional public book lookup is removed without losing existing enriched recommendations',()=>{
  const recs=text('recommendations.mjs'),app=text('app.mjs'),rules=text('firestore.rules');
  assert.doesNotMatch(recs,/書誌を検索|searchBookMetadata|bookLookup|openlibrary\.org/);
  assert.doesNotMatch(app,/book-lookup\.mjs/);
  assert.match(recs,/compose\.append\(title,url,reason,submit,status\)/);
  assert.match(recs,/const enriched=group\.find\(r=>r\.coverUrl\|\|r\.author\|\|r\.publisher\)/);
  assert.match(recs,/enriched\?\.coverUrl/);
  assert.match(recs,/rec\.authorUid===user\.uid/);
  assert.match(rules,/metadataSource/);
});

test('formal child reflection composer is owner-only and separate from informal comments',()=>{
  const community=text('book-community.mjs');
  const form=text('owner-reflection.mjs');
  const dictation=text('speech-dictation.mjs');
  assert.match(community,/if\(owner\)/);
  assert.match(community,/addOwnerReflectionForm/);
  assert.match(form,/source:'owner-app'/);
  assert.match(form,/attribution:kind\.value/);
  assert.match(dictation,/SpeechRecognition/);
  assert.doesNotMatch(dictation,/MediaRecorder|uploadBytes/);
});


test('v9 owner reflection and browser dictation modules have versioned import edges',()=>{
  const app=text('app.mjs'),community=text('book-community.mjs');
  const reflection=text('owner-reflection.mjs'),speech=text('speech-dictation.mjs');
  const build='20261019-shelf-v28';
  assert.ok(community.includes("'./owner-reflection.mjs?build="+build+"'"));
  assert.ok(reflection.includes("'./speech-dictation.mjs?build="+build+"'"));
  assert.match(reflection,/writeBatch\(db\)/);
  assert.match(reflection,/batch\.set\(reflection,/);
  assert.match(reflection,/batch\.set\(activity,/);
  assert.match(reflection,/await batch\.commit\(\)/);
  assert.match(speech,/recognizer\.lang='ja-JP'/);
  assert.match(speech,/session\?\.abort\(\)/);
  assert.doesNotMatch(app,/uploadBytes|MediaRecorder/);
});

test('invitation URLs are generated in a fragment and consumed by a transaction',()=>{
  const app=text('app.mjs'),links=text('invite-links.mjs'),rules=text('firestore.rules');
  assert.match(app,/runTransaction\(db,async transaction=>/);
  assert.match(app,/transaction\.update\(invite,/);
  assert.match(app,/transaction\.set\(membership,/);
  assert.match(rules,/match \/openInvites\/\{token\}/);
  assert.match(links,/crypto\.getRandomValues/);
  assert.match(links,/url\.hash/);
});
test('shelf uses small CDN cover with fallback to original URL',()=>{
  const app=text('app.mjs');
  assert.match(app,/shelfThumbnailUrl\(url\)/);
  assert.match(app,/img\.src=url/);
});

test('all family avatars use public nickname profiles, with private owner email management',()=>{
  const app=text('app.mjs'),rules=text('firestore.rules');
  assert.match(app,/familyCollection\('publicProfiles'\)/);
  assert.match(app,/requireNickname\(id,seq\)/);
  assert.match(app,/normalizeNickname\(nicknameInput\.value\)/);
  assert.match(app,/if\(role==='owner'\)\{\s*unsubs\.push\(onSnapshot\(familyCollection\('members'\)/);
  assert.match(app,/const listing=role==='owner'\?members:profiles/);
  assert.match(rules,/allow list: if owner\(fid\);/);
  assert.match(rules,/match \/publicProfiles\/\{uid\}/);
  assert.match(rules,/allow get, list: if member\(fid\)/);
  assert.doesNotMatch(text('recommendations.mjs'),/uid===user\.uid\?'自分'/);
});
test('reaction toggles publish and retract feed records in one batch',()=>{
  const community=text('book-community.mjs'),feed=text('activity.mjs'),rules=text('firestore.rules');
  assert.match(community,/reactionActivityFor=verb=>doc\(activity,verb\+'-'\+book\.id\+'-'\+user\.uid\)/);
  assert.match(community,/batch\.set\(key,\{uid:user\.uid,kind:/);
  assert.match(community,/batch\.set\(activityRef,\{actorUid:user\.uid,kind:/);
  assert.match(community,/batch\.delete\(key\)/);
  assert.match(community,/if\(existing\.exists\(\)\)batch\.delete\(activityRef\)/);
  assert.match(feed,/like:who\+'が「いいね」しました'/);
  assert.match(feed,/'ask-reflection':who\+'が感想をききたいと伝えました'/);
  assert.match(rules,/validReactionActivity\(fid, activityId\)/);
  assert.match(rules,/existsAfter\(reaction\)/);
});
test('page copy favors plain labels over repeated family qualifiers',()=>{
  const html=text('index.html'),community=text('book-community.mjs');
  const recs=text('recommendations.mjs'),feed=text('activity.mjs'),app=text('app.mjs');
  assert.match(html,/aria-label="設定"/);
  assert.match(feed,/heading\.textContent='最近の活動'/);
  assert.match(community,/communityHeading','感想とコメント'/);
  assert.match(community,/elem\('h4','','コメント'\)/);
  assert.match(recs,/el\('h2','','おすすめ'\)/);
  assert.match(app,/heading\.textContent='メンバー'/);
  assert.doesNotMatch(feed,/家族の最近の活動/);
  assert.doesNotMatch(recs,/家族のおすすめ/);
});

test('profile editor survives onSnapshot rerender without remounting its input',()=>{
  const app=text('app.mjs'),css=text('style.css');
  const start=app.indexOf('function renderFamily(){');
  const end=app.indexOf('async function start(){',start);
  const body=app.slice(start,end);
  assert.match(body,/if\(root\.dataset\.screen!=='family'\)\{/);
  assert.match(body,/nicknameInput\.oninput=\(\)=>\{nicknameInput\.dataset\.dirty='true'\}/);
  assert.match(body,/const memberArea=root\.querySelector\('\[data-family-members\]'\)/);
  assert.match(body,/memberArea\.replaceChildren\(\)/);
  assert.match(body,/const inviteArea=root\.querySelector\('\[data-family-invites\]'\)/);
  assert.match(body,/if\(input&&!input\.dataset\.dirty&&document\.activeElement!==input\)/);
  assert.equal((body.match(/root\.replaceChildren\(\)/g)||[]).length,1,'editor root must be replaced only when entering settings');
  assert.match(css,/\.settingsMembers,\.settingsInvites/);
  assert.match(app,/delete \$\('content'\)\.dataset\.screen/);
});
test('recent activity has a stable slot independent from filtered book results',()=>{
  const app=text('app.mjs'),html=text('index.html'),feed=text('activity.mjs');
  assert.match(html,/id="activityMount" hidden/);
  assert.ok(html.indexOf('id="activityMount"')<html.indexOf('id="content"'));
  assert.match(app,/activityMount\.hidden=view!=='shelf'/);
  assert.match(app,/if\(view==='shelf'&&!closeActivity\)/);
  assert.match(app,/else if\(view!=='shelf'&&closeActivity\)/);
  assert.equal((app.match(/closeActivity=mountFamilyActivity\(/g)||[]).length,1);
  const empty=app.indexOf('if(!data.length){',app.indexOf('function render(){'));
  const mounted=app.indexOf('closeActivity=mountFamilyActivity(');
  assert.ok(mounted>=0&&empty>mounted,'feed must mount before empty-result early return');
  assert.match(feed,/orderBy\('createdAt','desc'\),limit\(count\)/);
});
test('empty book and series states are visible and use distinct messages',()=>{
  const app=text('app.mjs'),domain=text('domain.mjs');
  assert.match(app,/emptyStateMessage\(\{view,search:opts\.search,hasBooks:books\.length>0\}\)/);
  assert.match(app,/emptyStateMessage\(\{view:'series',search:opts\.search\}\)/);
  assert.match(domain,/if\(view==='series'\)return 'シリーズに登録された本はまだありません。'/);
  assert.match(domain,/if\(String\(search\)\.trim\(\)\)/);
});

test('nickname refresh redraws activity without re-subscribing',()=>{
  const app=text('app.mjs'),activity=text('activity.mjs');
  assert.match(app,/render\(\);closeActivity\?\.refresh\?\.\(\)/);
  assert.match(activity,/dispose\.refresh=refresh/);
  assert.match(activity,/stop=onSnapshot\(query\(entries/);
});

test('v14 mobile ergonomics protects taps, form zoom, long titles and dialog focus',()=>{
  const css=text('style.css'),html=text('index.html');
  const marker=css.indexOf('/* v14 mobile usability:');
  assert.ok(marker>0,'mobile CSS audit rules must exist');
  const v14=css.slice(marker);
  assert.match(v14,/@media \(max-width:650px\)/);
  assert.match(v14,/button:not\(\.book\), \.bookMetadataDetails>summary, \.reflectionEditorDetails>summary/);
  assert.match(v14,/min-height:44px/);
  assert.match(v14,/\.headerActions \.iconButton \{ width:44px; height:44px; min-width:44px; \}/);
  assert.match(v14,/input, select, textarea, #bookControls \.fieldLabel select \{ font-size:16px; \}/);
  assert.match(v14,/\.fieldLabel \.srOnly \{/);
  assert.match(v14,/@media \(max-width:440px\)/);
  assert.match(css,/\.bookSelectRow\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);gap:7px\}/);
  assert.match(v14,/\.commentActions \.textAction/);
  assert.match(v14,/\.activityBook \{[^}]*-webkit-line-clamp:2/s);
  assert.match(v14,/max-height:calc\(100dvh - 24px - env\(safe-area-inset-top, 0px\) - env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(v14,/prefers-reduced-motion:reduce/);
  assert.match(v14,/textarea:focus-visible, summary:focus-visible, a:focus-visible/);
  assert.match(html,/<dialog id="bookInfoDialog" aria-labelledby="bookInfoTitle">/);
});

test('v15: changing the bookshelf title changes all reader-specific reflection labels',()=>{
  const app=text('app.mjs'),community=text('book-community.mjs'),
    owner=text('owner-reflection.mjs'),activity=text('activity.mjs');
  assert.match(app,/readerNameFromShelf\(household\?\.name\)/);
  assert.match(community,/readerName\+'の感想'/);
  assert.match(owner,/readerName\+'の感想を記録する'/);
  assert.match(activity,/reflection:\(readerName\?\.\(\)\|\|'子ども'\)\+'の感想が記録されました'/);
});
test('v15: returning to shelf and first load choose read books, without stale search',()=>{
  const app=text('app.mjs'),html=text('index.html');
  assert.match(app,/const resetShelf=\(\)=>\{\$\('filter'\)\.value=ACTIVE_READ_FILTER;\$\('search'\)\.value=''\}/);
  assert.match(app,/if\(b\.dataset\.view==='shelf'\)resetShelf\(\)/);
  assert.match(html,/<option value="active-read">読んでる・読んだ<\/option>/);
});
test('v15: targeted comments are resolved independently and hidden ones never displayed',()=>{
  const app=text('app.mjs'),community=text('book-community.mjs'),activity=text('activity.mjs');
  assert.match(app,/openBookInfo\(found,commentId\)/);
  assert.match(community,/onSnapshot\(selected,snapshot=>/);
  assert.match(community,/snapshot\.exists\(\)&&!snapshot\.data\(\)\.hidden/);
  assert.match(community,/card\.classList\.add\('commentFocused'\)/);
  assert.match(activity,/item\.kind==='comment'\?item\.sourceId:null/);
});
test('v15: user-controlled compact and acknowledged activity; more history remains opt-in',()=>{
  const feed=text('activity.mjs'),css=text('style.css');
  assert.match(feed,/const RECENT_VISIBLE=3/);
  assert.match(feed,/const PAGE_SIZE=20/);
  assert.match(feed,/activityAcknowledge/);
  assert.match(feed,/localStorage\.setItem\(storageKey,String\(seenAt\)\)/);
  assert.match(feed,/const count=expanded\?visibleLimit\+1:RECENT_FETCH/);
  assert.match(css,/\.familyActivityControls/);
});

test('v16 owner-only pending reflection queue is lazy, bounded and leaves existing roles unchanged',()=>{
  const app=text('app.mjs'),pending=text('pending-reflections.mjs'),form=text('owner-reflection.mjs'),
    community=text('book-community.mjs');
  assert.match(app,/if\(role==='owner'\)\{\s*pendingUI=mountPendingReflections/);
  assert.match(app,/if\(view!=='family'&&pendingUI\)\{pendingUI\.dispose\(\);pendingUI=null\}/);
  assert.match(app,/onReflectionSaved:\(\)=>\{void pendingUI\?\.refresh\(\)\}/);
  assert.match(form,/onSaved\?\.\(\)/);
  assert.match(community,/onSaved:onReflectionSaved/);
  assert.match(pending,/root\.addEventListener\('toggle',onToggle\)/);
  assert.match(pending,/if\(disposed\|\|!root\.open\)return/);
  assert.match(pending,/limit\(101\)/);
  assert.match(pending,/limit\(1\)/);
  assert.match(pending,/Math\.min\(3,entries\.length\)/);
  assert.doesNotMatch(pending,/onSnapshot\(|collectionGroup\(/);
  assert.doesNotMatch(pending,/setDoc\(|writeBatch\(|deleteDoc\(/);
});

test('revoked account returns to a recovery screen instead of permanent loading and cannot self-regrant',()=>{
  const app=text('app.mjs'),rules=text('firestore.rules');
  assert.match(app,/if\(e\?\.code==='stale-family-access'\)/);
  assert.match(app,/show\('setupPanel'\)/);
  assert.match(app,/管理者から新しい招待URLを受け取れば/);
  assert.match(app,/const retry=document\.createElement\('button'\)/);
  assert.match(app,/stage='family-access'/);
  assert.match(app,/staleMembershipRoute\(\{/);
  assert.match(app,/route==='one-time-invite'/);
  assert.match(app,/route==='email-invite'/);
  assert.match(rules,/resource\.data\.familyId == request\.resource\.data\.familyId/);
  assert.match(rules,/match \/openInvites\/\{token\}/);
  assert.match(rules,/!exists\(memberPath\(fid,request\.auth\.uid\)\)/);
});

test('member deletion is not a block: fresh re-invitation works but consumed tokens do not',()=>{
  const app=text('app.mjs'),rules=text('firestore.rules');
  assert.match(app,/revoke\.textContent='メンバーから削除'/);
  assert.match(app,/ブロックではないため、新しい招待URLから再登録できます/);
  assert.match(app,/削除済みアカウントの再登録には新しい招待URLが必要です/);
  assert.match(app,/if\(inviteResult==='already-claimed-by-self'\)/);
  assert.match(app,/const existing=await getDoc\(membership\)\.catch\(\(\)=>null\)/);
  assert.match(rules,/!exists\(memberPath\(fid,request\.auth\.uid\)\)/);
  assert.match(rules,/allow delete: if owner\(fid\) && resource\.data\.role != 'owner'/);
});

test('v17b reflection withdrawal and restoration moves entire records to owner-only archive',()=>{
  const community=text('book-community.mjs'),archive=text('reflection-withdrawal.mjs'),rules=text('firestore.rules');
  assert.match(community,/withdrawReflection\(\{db,fid,bookId:book\.id,reflectionId:entry\.id,uid:user\.uid\}\)/);
  assert.match(community,/restoreReflection\(\{db,fid,bookId:book\.id,reflectionId:entry\.id\}\)/);
  assert.match(community,/query\(archive,orderBy\('withdrawnAt','desc'\),limit\(30\)\)/);
  assert.match(archive,/batch\.set\(privateRef,\{original:current\.data\(\),withdrawnAt:serverTimestamp\(\),withdrawnBy:uid\}\)/);
  assert.match(archive,/batch\.delete\(publicRef\)/);
  assert.match(archive,/batch\.set\(publicRef,archived\.data\(\)\.original\)/);
  assert.match(archive,/batch\.delete\(privateRef\)/);
  assert.match(archive,/activity\.exists\(\)/);
  assert.match(rules,/match \/withdrawnReflections\/\{reflectionId\}/);
  assert.match(rules,/getAfter\(archivedReflectionPath/);
  assert.match(rules,/getAfter\(childReflectionPath/);
  assert.doesNotMatch(archive,/batch\.set\(activityRef,/);
});

test('v17b respects user copy decisions and preserves deleted-member rejoin protections',()=>{
  const activity=text('activity.mjs'),community=text('book-community.mjs'),app=text('app.mjs');
  assert.match(activity,/新しい活動はありません。/);
  assert.doesNotMatch(activity,/確認済みです。必要なときに履歴を開けます。/);
  assert.match(community,/感想はまだありません。/);
  assert.doesNotMatch(community,/感想は管理者が記録します。/);
  assert.match(community,/owner-reflection\.mjs\?build=20261019-shelf-v28/);
  assert.match(app,/if\(e\?\.code==='stale-family-access'\)/);
  assert.match(app,/メンバーから削除/);
  assert.match(app,/新しい招待URLから再登録できます/);
});


test('single unread shelf filter represents interested books; recommendations stay separate',()=>{
  const html=text('index.html');
  const opts=[...html.matchAll(/<option\s+value="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(opts.filter(x=>x==='unread').length,1);
  assert.match(html,/<option value="unread">きになる<\/option>/);
  assert.doesNotMatch(html,/読んでない/);
  assert.equal(STATUSES.unread,'きになる');
  assert.equal(opts.filter(x=>/^(?:interest|interested|wishlist|want-to-read)$/.test(x)).length,0);
  assert.match(html,/data-view="recommendations"/);
  assert.match(html,/data-view="shelf"/);
  const domain=text('domain.mjs');
  assert.match(domain,/INTEREST_SHELF_STATUS='unread'/);
  const app=text('app.mjs');
  assert.match(app,/STATUSES\[b\.status\]/);
  assert.match(app,/view==='recommendations'/);
});

test('v19: shelf offers four filters and actively groups reading first without timeline',()=>{
  const html=text('index.html'),app=text('app.mjs');
  const filter=html.slice(html.indexOf('<select id="filter"'),html.indexOf('</select>',html.indexOf('<select id="filter"')));
  const options=[...filter.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m=>({value:m[1],label:m[2]}));
  assert.deepEqual(options,[
    {value:'active-read',label:'読んでる・読んだ'},
    {value:'all',label:'すべての本'},
    {value:'paused',label:'お休み中の本'},
    {value:'unread',label:'きになる'}
  ]);
  assert.match(app,/if\(opts\.filter===ACTIVE_READ_FILTER&&opts\.sort!=='rating-high'\)/);
  assert.match(app,/root\.append\(shelfSection\('いま読んでる',reading\)\)/);
  assert.match(app,/root\.append\(shelfSection\('読んだ本',completed\)\)/);
  assert.match(app,/root\.append\(bookGrid\(data\)\);return/);
  assert.doesNotMatch(app,/periodMode|readPeriodGrouping|<option value="timeline">/);
  assert.match(app,/\$\('readCount'\)\.textContent=books\.filter\(b=>b\.status==='read'\)\.length/);
});

test('P2: card renderer keeps both labels inside the cover and gracefully survives image failure',()=>{
  const js=text('app.mjs'),css=text('style.css');
  const source=js.slice(js.indexOf('function bookGrid(data){'),js.indexOf('function openBookInfo('));
  assert.ok(source.startsWith('function bookGrid(data){'));
  class Node {
    constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.className='';}
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);}
  }
  const document={createElement:tag=>new Node(tag)};
  const bookGrid=new Function('document','safeCover','shelfThumbnailUrl','STATUSES','readingModeLabel','compactReadPeriodLabel','openBookInfo','coverStatusLabel','coverIsAlternate',
    source+'return bookGrid;')(document,v=>v||'',v=>v+'?thumb',STATUSES,readingModeLabel,compactReadPeriodLabel,()=>{},coverStatusLabel,coverIsAlternate);
  const one=b=>bookGrid([b]).children[0];
  const item=one({title:'読了本',status:'read',readingMode:'read-aloud',finishedAt:'2026-10-16',coverUrl:'https://example.org/book.png'});
  assert.equal(item.children.length,3);
  const [cover,title,author]=item.children;
  assert.equal(title.textContent,'読了本');
  assert.equal(author.textContent,'作者未登録');
  assert.equal(cover.children.filter(n=>n.className==='modeChip').length,1);
  assert.equal(cover.children.find(n=>n.className==='modeChip').textContent,'読み聞かせ');
  assert.equal(cover.children.find(n=>n.className==='flag read').textContent,'読んだ 2026.10');
  const img=cover.children.find(n=>n.tag==='img');
  assert.equal(img.src,'https://example.org/book.png?thumb');
  img.onerror(); // thumbnail failure retries the original source
  assert.equal(img.src,'https://example.org/book.png');
  img.onerror(); // source failure removes only the image, not either badge
  assert.equal(cover.children.some(n=>n.tag==='img'),false);
  assert.equal(cover.children.find(n=>n.className==='flag read').textContent,'読んだ 2026.10');
  assert.equal(cover.children.find(n=>n.className==='modeChip').textContent,'読み聞かせ');
  const independent=one({title:'自力',status:'reading',readingMode:'independent'});
  assert.equal(independent.children[0].children.find(n=>n.className==='modeChip').textContent,'自力読書');
  assert.equal(independent.children[0].children.find(n=>n.className==='flag reading').textContent,'読んでる');
  const mixed=one({title:'併用',status:'paused',readingMode:'mixed'});
  assert.equal(mixed.children[0].children.find(n=>n.className==='modeChip').textContent,'併用');
  const unread=one({title:'未読',status:'unread',readingMode:'read-aloud'});
  assert.equal(unread.children[0].children.some(n=>n.className==='modeChip'),false);
  assert.equal(unread.children[0].children.find(n=>n.className==='flag unread').textContent,'きになる');
  const alternate=one({title:'ムーミン谷の彗星',status:'unread',coverUrl:'https://example.org/cover.jpg',
    coverEditionStatus:'known-alternate-edition-reference'});
  assert.equal(alternate.children.at(-1).className,'bookCoverEditionNote');
  assert.equal(alternate.children.at(-1).textContent,'別版の参考書影');
  assert.equal(alternate.children[0].children.find(n=>n.tag==='img').alt,'ムーミン谷の彗星 の別版の参考書影');
  const unknown=one({title:'不明',status:'read',finishedPeriodLabel:'期間不明'});
  assert.equal(unknown.children[0].children.find(n=>n.className==='flag read').textContent,'読んだ');
  // CSS contract: badges cannot intercept the single book-card button or wrap.
  assert.match(css,/\.flag \{[^}]*white-space: nowrap;[^}]*pointer-events: none;/);
  assert.match(css,/\.book \.cover \.modeChip\{[^}]*white-space:nowrap;pointer-events:none;/);
  assert.match(css,/@media\(max-width:440px\)\{[\s\S]*?\.book \.cover \.modeChip,\.book \.cover \.flag\{font-size:9px/);
  assert.match(css,/@media\(max-width:360px\)\{ \.books \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\); \} \}/);
  assert.ok(!source.includes('bookReadingTrail'),'card must not repeat mode or period under cover');
  assert.ok(source.includes('coverIsAlternate(b)'));
});

test('P3: publication year is always bibliographic content outside cover for all filters',()=>{
  const app=text('app.mjs'),css=text('style.css');
  const source=app.slice(app.indexOf('function bookGrid(data){'),app.indexOf('function openBookInfo('));
  class Node {
    constructor(tag){this.tag=tag;this.children=[];this.className='';this.textContent='';}
    append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
    remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);}
  }
  const document={createElement:tag=>new Node(tag)};
  const bookGrid=new Function('document','safeCover','shelfThumbnailUrl','STATUSES','readingModeLabel','compactReadPeriodLabel','openBookInfo','coverStatusLabel','coverIsAlternate',
    source+'return bookGrid;')(document,()=>'',x=>x,STATUSES,readingModeLabel,compactReadPeriodLabel,()=>{},()=>'',()=>false);
  const card=b=>bookGrid([b]).children[0];
  for(const status of ['read','reading','paused','unread']){
    const b={title:'書誌テスト',status,publicationYear:2015,readingMode:'read-aloud',finishedAt:'2026-10-16'};
    const node=card(b);
    assert.equal(node.children[0].className,'cover');
    assert.equal(node.children[0].children.some(c=>c.className==='bookPublicationYear'),false);
    assert.equal(node.children[3].className,'bookPublicationYear');
    assert.equal(node.children[3].textContent,'2015');
    assert.equal(node.children[0].children.some(c=>c.className.startsWith('flag ')),true);
  }
  for(const year of [null,undefined,'','unknown',0,12345]){
    const node=card({title:'年不明',status:'read',publicationYear:year});
    assert.equal(node.children.length,3);
  }
  const node=card({title:'共存',status:'read',publicationYear:2020,readingMode:'mixed',finishedAt:'2026-10-16'});
  assert.equal(node.children[0].children.find(c=>c.className==='modeChip').textContent,'併用');
  assert.equal(node.children[0].children.find(c=>c.className==='flag read').textContent,'読んだ 2026.10');
  assert.equal(node.children[3].textContent,'2020');
  assert.match(css,/\.bookPublicationYear \{[^}]*font-size: 10px;/);
  assert.doesNotMatch(source,/id="sort"|year-new|year-old/);
});

test('v25: owner-entered child stars and ranking do not mutate books',()=>{
  const app=text('app.mjs'),html=text('index.html'),css=text('style.css'),rules=text('firestore.rules');
  const rating=text('child-rating.mjs');
  assert.match(html,/<option value="rating-high">★の多い順<\/option>/);
  assert.match(app,/familyCollection\('childBookRatings'\)/);
  assert.match(app,/rating\.ariaLabel='本人の評価/);
  assert.match(app,/mountChildRating\(/);
  assert.match(rating,/runTransaction\(/);
  assert.match(rating,/この本、どのくらいすき？/);
  assert.match(css,/\.bookRating\{/);
  assert.match(rules,/match \/childBookRatings\/\{bookId\}/);
  assert.match(rules,/allow create, update, delete: if false;/);
});

test('bibliographic matching does not silently merge same-title recommendations',()=>{
  const app=text('app.mjs'),recs=text('recommendations.mjs');
  assert.ok(app.includes('coverStatusLabel(book)'));
  assert.ok(app.includes('coverIsAlternate(b)'));
  assert.ok(app.includes('editionStatusLabel(book)'));
  assert.ok(recs.includes('recommendationGroupKey(rec)'));
  assert.ok(recs.includes('shelfRelation(lead,booksNow)'));
  assert.ok(!recs.includes('booksNow.find(b=>normalize(b.title)===normalize(lead.title))'));
});

test('anonymous HTML does not disclose the household name',()=>{ const html=text('index.html'); assert.match(html,/id="shelfBrand"/); assert.match(html,/id="shelfName">本棚<\/h1>/); assert.match(text('app.mjs'),/shelfBrand/); });
