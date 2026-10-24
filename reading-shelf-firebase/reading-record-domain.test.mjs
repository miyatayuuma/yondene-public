import test from 'node:test';
import assert from 'node:assert/strict';
import {makeReadingNext,makeReadingMutation,initialPeriod,readingSnapshot,assertReadingRevision} from './reading-record-domain.mjs';
const book=(x={})=>({id:'b1',title:'本',status:'reading',readingMode:'read-aloud',updatedAt:'2026-10-17T12:00:00.000Z',notes:'本人が話した言葉',...x});
const draft=(x={})=>({status:'read',readingMode:'read-aloud',periodKind:'day',day:'2026-10-18',...x});
test('completed today keeps unrelated record intact and maintains exact date',()=>{
 const a=book(),v=makeReadingMutation(a,draft(),{eventId:'edit-00000000-0000-4000-8000-000000000001',
 updatedAt:'2026-10-18T12:00:00.000Z',editedAt:'server',actorUid:'owner'});
 assert.equal(v.patch.finishedAt,'2026-10-18');
 assert.equal(v.patch.finishedPeriodBasis,'owner_confirmed_date');
 assert.equal(v.patch.readingMode,'read-aloud');assert.equal(v.patch.status,'read');
 assert.equal(v.patch.notes,undefined);
 assert.equal(v.event.previous.status,'reading');assert.equal(v.event.next.status,'read');
 assert.equal(v.event.previousUpdatedAt,a.updatedAt);
});
test('reading start requires an explicit method; no unread stars written',()=>{
 assert.throws(()=>makeReadingNext(book({status:'unread',readingMode:''}),draft({status:'reading',readingMode:''})),/読み方/);
 const x=makeReadingNext(book({status:'unread',readingMode:''}),draft({status:'reading',readingMode:'mixed'}));
 assert.equal(x.next.readingMode,'mixed');assert.equal(x.next.finishedAt,'');
});
test('month, historical school term, and unknown have distinct precision',()=>{
 assert.equal(makeReadingNext(book(),draft({periodKind:'month',month:'2026-09'})).next.finishedAt,'2026-09');
 const period=makeReadingNext(book(),draft({periodKind:'period',label:'2026年秋',start:'2026-09',end:'2026-11',precision:'quarter'}));
 assert.equal(period.next.finishedPeriodLabel,'2026年秋');
 assert.equal(period.next.finishedPeriodStart,'2026-09');
 assert.equal(period.next.finishedAt,'');
 assert.equal(makeReadingNext(book(),draft({periodKind:'unknown'})).next.finishedAt,'');
 assert.throws(()=>makeReadingNext(book(),draft({periodKind:'day',day:'2026-02-30'})),/読了日/);
 assert.throws(()=>makeReadingNext(book(),draft({periodKind:'period',label:'春',start:'2026-06',end:'2026-04',precision:'quarter'})),/期間/);
});
test('existing imprecise period and child observations survive a readingMode correction',()=>{
 const current=book({status:'read',finishedAt:'',finishedPeriodLabel:'2026年春',finishedPeriodStart:'2026-04',
 finishedPeriodEnd:'2026-06',finishedPeriodPrecision:'quarter',notes:'発言を保持'});
 assert.equal(initialPeriod(current),'keep');
 const next=makeReadingNext(current,draft({status:'read',readingMode:'mixed',periodKind:'keep'})).next;
 assert.equal(next.finishedPeriodLabel,current.finishedPeriodLabel);
 assert.equal(next.finishedPeriodPrecision,'quarter');
 assert.equal(next.readingMode,'mixed');
 assert.equal(readingSnapshot(current).notes,undefined);
});
test('completed records require explicit mistake confirmation; do not misclassify a reread',()=>{
 const completed=book({status:'read',finishedAt:'2026-10-18',finishedPeriodBasis:'owner_confirmed_date'});
 assert.throws(()=>makeReadingNext(completed,draft({status:'reading'})),/訂正内容を確認/);
 assert.throws(()=>makeReadingNext(completed,draft({status:'unread'})),/訂正内容を確認/);
 assert.throws(()=>makeReadingNext(completed,draft({status:'paused'})),/訂正内容を確認/);
});
test('read-to-unread correction clears all active completion fields without changing annotations',()=>{
 const completed=book({status:'read',readingMode:'mixed',finishedAt:'2026-10',finishedPeriodLabel:'2026年秋',
   finishedPeriodStart:'2026-09',finishedPeriodEnd:'2026-11',finishedPeriodPrecision:'quarter',
   finishedPeriodBasis:'parent_confirmed',finishedPeriodNote:'元の推測',finishPrecision:'month',
   notes:'本人の原文は保持',readOrder:20});
 const next=makeReadingNext(completed,draft({status:'unread',correctionConfirmed:true})).next;
 assert.equal(next.status,'unread');assert.equal(next.readingMode,'');
 for(const k of ['finishedAt','finishedPeriodLabel','finishedPeriodStart','finishedPeriodEnd',
   'finishedPeriodPrecision','finishedPeriodBasis','finishedPeriodNote','finishPrecision'])assert.equal(next[k],'',k);
 const mutation=makeReadingMutation(completed,draft({status:'unread',correctionConfirmed:true}),
   {eventId:'edit-00000000-0000-4000-8000-000000000021',updatedAt:'2026-10-19T02:00:00.000Z',
     editedAt:'server',actorUid:'owner1'});
 assert.equal(mutation.patch.notes,undefined);
 assert.equal(mutation.patch.readOrder,undefined);
 assert.equal(mutation.event.previous.finishedPeriodLabel,'2026年秋');
 assert.equal(mutation.event.previous.finishedAt,'2026-10');
 assert.equal(mutation.event.next.finishedAt,'');
 assert.equal(mutation.event.correctionKind,'mistaken-completion');
 assert.equal(mutation.event.previousUpdatedAt,completed.updatedAt);
});
test('read-to-reading/paused correction keeps explicitly selected method, no reread event',()=>{
 for(const status of ['reading','paused']){
   const completed=book({status:'read',finishedAt:'2026-10-18'});
   const next=makeReadingNext(completed,draft({status,readingMode:'independent',correctionConfirmed:true})).next;
   assert.equal(next.status,status);assert.equal(next.readingMode,'independent');assert.equal(next.finishedAt,'');
   assert.throws(()=>makeReadingNext(completed,draft({status,readingMode:'',correctionConfirmed:true})),/読み方/);
 }
});
test('normal edits keep v26 event payload shape for Rules-first backwards compatibility',()=>{
 const a=book({status:'reading'});
 const v=makeReadingMutation(a,draft(),{eventId:'edit-00000000-0000-4000-8000-000000000022',
   updatedAt:'2026-10-19T02:00:00.000Z',editedAt:'server',actorUid:'owner1'});
 assert.ok(!Object.hasOwn(v.event,'correctionKind'));
});
test('no-op, malformed timestamps and legacy stale completion reject',()=>{
 assert.throws(()=>makeReadingNext(book(),draft({status:'reading'})),/変更がありません/);
 assert.throws(()=>makeReadingNext(book({status:'unread',finishedAt:'2024-01'}),draft({status:'reading'})),/古い読了情報/);
 assert.throws(()=>makeReadingMutation(book(),draft(),{eventId:'x',updatedAt:'2026-10-18T12:00:00.000Z'}),/識別子/);
 assert.throws(()=>makeReadingMutation(book(),draft(),{eventId:'edit-00000000-0000-4000-8000-000000000001',updatedAt:'2026-10-17T12:00:00.000Z'}),/更新時刻/);
});

test('v1 and browser concurrent writes require a fresh matching revision',()=>{
 const cached=book({status:'unread',readingMode:''});
 const v1Result={...cached,status:'reading',readingMode:'read-aloud',updatedAt:'2026-10-18T02:00:00.000Z'};
 assert.throws(()=>assertReadingRevision(v1Result,cached),/ほかの端末・ChatOps/);
 const browserResult={...cached,status:'read',readingMode:'read-aloud',updatedAt:'2026-10-18T03:00:00.000Z'};
 assert.throws(()=>assertReadingRevision(browserResult,cached),/ほかの端末・ChatOps/);
 assert.throws(()=>assertReadingRevision({...cached,readingMode:'mixed'},cached),/ほかの端末・ChatOps/);
 assert.doesNotThrow(()=>assertReadingRevision({...cached},cached));
});
test('returning an incorrectly started book to unread clears reading method without deleting notes',()=>{
 const c=book({status:'reading',readingMode:'read-aloud'});
 const after=makeReadingNext(c,draft({status:'unread'})).next;
 assert.equal(after.status,'unread');assert.equal(after.readingMode,'');
});
