import {readFileSync} from 'node:fs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {makeReadingMutation,readingSnapshot} from './reading-record-domain.mjs';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,Timestamp,serverTimestamp,query,where,orderBy,limit,writeBatch,runTransaction} from 'firebase/firestore';

const env=await initializeTestEnvironment({
  projectId:'demo-reading-shelf-rules',
  firestore:{host:'127.0.0.1',port:8080,rules:readFileSync(new URL('./firestore.rules',import.meta.url),'utf8')}
});
after(async()=>{await env.cleanup()});
const path=(...xs)=>['families','familyOne',...xs];
const user=(uid,email)=>env.authenticatedContext(uid,{email,email_verified:true}).firestore();
const anonymous=env.unauthenticatedContext().firestore();

await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,'families','familyOne'),{ownerUid:'owner1',name:'Test Family',schemaVersion:1,createdAt:Timestamp.now()});
  await setDoc(doc(db,...path('members','owner1')),{uid:'owner1',email:'owner@example.test',displayName:'Owner',role:'owner',joinedAt:Timestamp.now()});
  await setDoc(doc(db,...path('invites','viewer@example.test')),{email:'viewer@example.test',role:'viewer',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
  await setDoc(doc(db,...path('invites','editor@example.test')),{email:'editor@example.test',role:'editor',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
  await setDoc(doc(db,...path('books','book1')),{id:'book1',title:'テスト書籍',status:'read'});
  await setDoc(doc(db,...path('members','relative2')),{uid:'relative2',email:'relative2@example.test',displayName:'Relative 2',role:'viewer',joinedAt:Timestamp.now()});
});

test('anonymous and uninvited users cannot view a family book',async()=>{
  await assertFails(getDoc(doc(anonymous,...path('books','book1'))));
  await assertFails(getDoc(doc(user('stranger','stranger@example.test'),...path('books','book1'))));
  await assertFails(getDoc(doc(user('stranger','stranger@example.test'),...path('invites','viewer@example.test'))));
});
test('owner can view books but cannot edit from a browser',async()=>{
  const db=user('owner1','owner@example.test');
  await assertSucceeds(getDoc(doc(db,...path('books','book1'))));
  await assertFails(setDoc(doc(db,...path('books','book2')),{id:'book2',title:'猫と王さま',status:'read'}));
  await assertFails(deleteDoc(doc(db,...path('books','book1'))));
  await assertFails(setDoc(doc(db,...path('series','new-series')),{id:'new-series',name:'追加シリーズ'}));
});
test('invitation email must match actual signed-in Google email',async()=>{
  await assertFails(setDoc(doc(user('evil','evil@example.test'),...path('members','evil')),{uid:'evil',email:'evil@example.test',displayName:'Evil',role:'viewer',joinedAt:Timestamp.now()}));
  await assertFails(setDoc(doc(user('viewer1','viewer@example.test'),...path('members','viewer1')),{uid:'viewer1',email:'viewer@example.test',displayName:'Viewer',role:'owner',joinedAt:Timestamp.now()}));
});
test('invited viewer can join but cannot write books or self-escalate',async()=>{
  const db=user('viewer1','viewer@example.test');
  await assertSucceeds(getDoc(doc(db,...path('invites','viewer@example.test'))));
  await assertSucceeds(setDoc(doc(db,...path('members','viewer1')),{uid:'viewer1',email:'viewer@example.test',displayName:'Viewer',role:'viewer',joinedAt:Timestamp.now()}));
  await assertSucceeds(getDoc(doc(db,...path('books','book1'))));
  await assertFails(setDoc(doc(db,...path('books','wrong')),{id:'wrong',title:'No write',status:'read'}));
  await assertFails(setDoc(doc(db,...path('members','viewer1')),{uid:'viewer1',email:'viewer@example.test',displayName:'Viewer',role:'owner',joinedAt:Timestamp.now()}));
});
test('old editor membership is also read-only for books',async()=>{
  const db=user('editor1','editor@example.test');
  await assertSucceeds(setDoc(doc(db,...path('members','editor1')),{uid:'editor1',email:'editor@example.test',displayName:'Editor',role:'editor',joinedAt:Timestamp.now()}));
  await assertFails(setDoc(doc(db,...path('books','book3')),{id:'book3',title:'新しい本',status:'read'}));
  await assertFails(setDoc(doc(db,...path('invites','outsider@example.test')),{email:'outsider@example.test',role:'editor',expiresAt:Timestamp.fromMillis(Date.now()+86400000)}));
});
test('revocation denies subsequent remote reads',async()=>{
  const o=user('owner1','owner@example.test');
  await assertSucceeds(deleteDoc(doc(o,...path('members','viewer1'))));
  await assertFails(getDoc(doc(user('viewer1','viewer@example.test'),...path('books','book1'))));
});

test('family members can comment but cannot impersonate other authors',async()=>{
  const member=user('relative2','relative2@example.test');
  const other=user('stranger','stranger@example.test');
  const ref=doc(member,...path('books','book1','comments','commentA'));
  const content={authorUid:'relative2',body:'この本、また読んでほしい',hidden:false,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  await assertFails(setDoc(doc(other,...path('books','book1','comments','bad')),content));
  await assertFails(setDoc(ref,{...content,authorUid:'owner1'}));
  await assertSucceeds(setDoc(ref,content));
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(doc(user('owner1','owner@example.test'),...path('books','book1','comments','commentA')),{body:'改ざん',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(ref,{body:'もう一度読みたい',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{authorUid:'owner1'}));
  await assertFails(setDoc(doc(member,...path('books','book1','childReflections','child01')),
    {quote:'実際には言っていない'}));
});
test('owner may moderate but not impersonate family; hidden content is excluded',async()=>{
  const owner=user('owner1','owner@example.test');
  const member=user('relative2','relative2@example.test');
  const ref=doc(owner,...path('books','book1','comments','commentA'));
  await assertSucceeds(updateDoc(ref,{hidden:true}));
  await assertFails(updateDoc(doc(member,...path('books','book1','comments','commentA')),{hidden:false}));
  await assertFails(getDoc(doc(user('stranger','stranger@example.test'),...path('books','book1','comments','commentA'))));
  const visible=query(collection(member,...path('books','book1','comments')),where('hidden','==',false));
  await assertSucceeds(getDocs(visible));
  await assertSucceeds(updateDoc(ref,{hidden:false}));
  await assertSucceeds(getDocs(visible));
});
test('reactions and reflection requests are owned by the authenticated family member',async()=>{
  const member=user('relative2','relative2@example.test');
  for(const [bucket,kind] of [['reactions','like'],['requests','ask-reflection']]){
    const ref=doc(member,...path('books','book1',bucket,'relative2'));
    await assertSucceeds(setDoc(ref,{uid:'relative2',kind,createdAt:serverTimestamp()}));
    await assertFails(setDoc(doc(user('owner1','owner@example.test'),...path('books','book1',bucket,'relative2')),
      {uid:'relative2',kind,createdAt:serverTimestamp()}));
    await assertFails(updateDoc(ref,{kind:'hack'}));
    await assertSucceeds(deleteDoc(ref));
  }
});

test('recommendations permit family sharing but prohibit impersonation and catalog writes',async()=>{
  const relative=user('relative2','relative2@example.test');
  const outsider=user('stranger','stranger@example.test');
  const owner=user('owner1','owner@example.test');
  const pathTo=['families','familyOne','recommendations','recommend1'];
  const value={authorUid:'relative2',title:'ねこと王さま',normalizedTitle:'ねこと王さま',
    reason:'絵が気に入った',url:'https://example.com/book',hidden:false,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  await assertFails(setDoc(doc(outsider,...pathTo),value));
  await assertFails(setDoc(doc(relative,...pathTo),{...value,authorUid:'owner1'}));
  await assertFails(setDoc(doc(relative,...pathTo),{...value,url:'javascript:alert(1)'}));
  await assertSucceeds(setDoc(doc(relative,...pathTo),value));
  await assertSucceeds(getDoc(doc(relative,...pathTo)));
  await assertFails(updateDoc(doc(owner,...pathTo),{reason:'勝手に改ざん',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(relative,...pathTo),{title:'別の本'}));
  await assertSucceeds(updateDoc(doc(relative,...pathTo),{reason:'一緒に読みたい',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(doc(owner,...pathTo),{hidden:true}));
  const visible=query(collection(relative,'families','familyOne','recommendations'),where('hidden','==',false));
  await assertSucceeds(getDocs(visible));
  await assertSucceeds(updateDoc(doc(owner,...pathTo),{hidden:false}));
  await assertSucceeds(deleteDoc(doc(relative,...pathTo)));
});


test('book lookup metadata is optional; unsafe covers and unexpected fields are rejected',async()=>{
  const family=user('relative2','relative2@example.test');
  const record={authorUid:'relative2',title:'あたらしい本',normalizedTitle:'あたらしい本',
    reason:'おすすめ',url:'',hidden:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  const reference=doc(family,...path('recommendations','with-metadata'));
  await assertSucceeds(setDoc(reference,{...record,
    author:'作家',publisher:'出版社',publishedDate:'2021-09',
    isbn:'9784198650032',coverUrl:'https://books.google.com/books/content?id=book',
    metadataSource:'https://books.google.com/books?id=book'}));
  await assertFails(setDoc(doc(family,...path('recommendations','bad-cover')),
    {...record,coverUrl:'javascript:alert(1)'}));
  await assertFails(setDoc(doc(family,...path('recommendations','unexpected')),
    {...record,privateEmail:'example@private.test'}));
});
test('only authenticated family may publish metadata-only activity',async()=>{
  const family=user('relative2','relative2@example.test');
  const stranger=user('stranger','stranger@example.test');
  const data={actorUid:'relative2',kind:'comment',title:'ねこと王さま',
    bookId:'book1',sourceId:'comment-new',hidden:false,createdAt:serverTimestamp()};
  await assertFails(setDoc(doc(stranger,...path('activity','bad')),data));
  await assertFails(setDoc(doc(family,...path('activity','spoof')),{...data,actorUid:'owner1'}));
  await assertFails(setDoc(doc(family,...path('activity','body')),{...data,body:'子どもの感想全文'}));
  await assertSucceeds(setDoc(doc(family,...path('activity','activity1')),data));
  const stream=query(collection(family,...path('activity')),orderBy('createdAt','desc'),limit(10));
  await assertSucceeds(getDocs(stream));
  await assertFails(updateDoc(doc(family,...path('activity','activity1')),{hidden:true}));
  await assertSucceeds(updateDoc(doc(user('owner1','owner@example.test'),...path('activity','activity1')),{hidden:true}));
  await assertSucceeds(deleteDoc(doc(family,...path('activity','activity1'))));
});
test('community comment plus activity can be committed in one atomic batch',async()=>{
  const family=user('relative2','relative2@example.test');
  const batch=writeBatch(family);
  batch.set(doc(family,...path('books','book1','comments','new-comment')),{
    authorUid:'relative2',body:'大好きな本です',createdAt:serverTimestamp(),
    updatedAt:serverTimestamp(),hidden:false
  });
  batch.set(doc(family,...path('activity','comment-new-comment')),{
    actorUid:'relative2',kind:'comment',title:'ねこと王さま',
    bookId:'book1',sourceId:'new-comment',hidden:false,createdAt:serverTimestamp()
  });
  await assertSucceeds(batch.commit());
});

test('owner may add child reflection, other family members cannot',async()=>{
 const owner=user('owner1','owner@example.test');
 const other=user('relative2','relative2@example.test');
 const loc=path('books','book1','childReflections','new-reflection');
 const payload={quote:'また読みたい',attribution:'verbatim',observedAt:'2026-10',
   source:'owner-app',authorUid:'owner1',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(other,...loc),{...payload,authorUid:'relative2'}));
 await assertSucceeds(setDoc(doc(owner,...loc),payload));
 await assertSucceeds(getDoc(doc(other,...loc)));
 await assertFails(updateDoc(doc(owner,...loc),{quote:'訂正'}));
 await assertFails(deleteDoc(doc(owner,...loc)));
});


test('owner child reflection and metadata-only activity are committed together',async()=>{
  const owner=user('owner1','owner@example.test');
  const reflection=doc(owner,...path('books','book1','childReflections','atomic-owner-reflection'));
  const activity=doc(owner,...path('activity','reflection-atomic-owner-reflection'));
  const batch=writeBatch(owner);
  batch.set(reflection,{quote:'また読みたい',attribution:'parent-summary',observedAt:'2026年10月',
    source:'owner-app',authorUid:'owner1',createdAt:serverTimestamp()});
  batch.set(activity,{actorUid:'owner1',kind:'reflection',title:'テスト書籍',bookId:'book1',
    sourceId:'atomic-owner-reflection',hidden:false,createdAt:serverTimestamp()});
  await assertSucceeds(batch.commit());
  const record=await getDoc(reflection);
  const feed=await getDoc(activity);
  if(!record.exists()||!feed.exists())throw new Error('atomic owner reflection or activity missing');
  if(feed.data().quote!==undefined)throw new Error('child quote must not be copied into activity');
});

test('other family members cannot forge child reflections or their activity in a batch',async()=>{
  const member=user('relative2','relative2@example.test');
  const owner=user('owner1','owner@example.test');
  const reflectionPath=path('books','book1','childReflections','denied-family-reflection');
  const activityPath=path('activity','reflection-denied-family-reflection');
  const batch=writeBatch(member);
  batch.set(doc(member,...reflectionPath),{quote:'なりすまし',attribution:'verbatim',observedAt:'',
    source:'owner-app',authorUid:'relative2',createdAt:serverTimestamp()});
  batch.set(doc(member,...activityPath),{actorUid:'relative2',kind:'reflection',title:'テスト書籍',
    bookId:'book1',sourceId:'denied-family-reflection',hidden:false,createdAt:serverTimestamp()});
  await assertFails(batch.commit());
  const record=await getDoc(doc(owner,...reflectionPath));
  const feed=await getDoc(doc(owner,...activityPath));
  if(record.exists()||feed.exists())throw new Error('rejected atomic write left an unauthorized record');
});

test('reflection schema rejects fabricated attribution and altered source',async()=>{
  const owner=user('owner1','owner@example.test');
  const base={quote:'確認できない発言',attribution:'verbatim',observedAt:'',source:'owner-app',
    authorUid:'owner1',createdAt:serverTimestamp()};
  await assertFails(setDoc(doc(owner,...path('books','book1','childReflections','invalid-attribution')),
    {...base,attribution:'unspecified'}));
  await assertFails(setDoc(doc(owner,...path('books','book1','childReflections','invalid-source')),
    {...base,source:'family-comment'}));
  await assertFails(setDoc(doc(owner,...path('books','book1','childReflections','wrong-owner')),
    {...base,authorUid:'relative2'}));
});

const tokenA='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const tokenB='BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const linkPath=t=>path('openInvites',t);
const memberData=(uid,email,token,role='viewer')=>({uid,email,displayName:'Family',role,
  joinedAt:serverTimestamp(),inviteToken:token});
async function claim(db,token,uid,email,role='viewer'){
 return runTransaction(db,async tx=>{
  const invite=doc(db,...linkPath(token));
  const snapshot=await tx.get(invite);
  if(!snapshot.exists()||snapshot.data().claimedByUid)throw Error('Unavailable');
  tx.update(invite,{claimedByUid:uid,claimedAt:serverTimestamp()});
  tx.set(doc(db,...path('members',uid)),memberData(uid,email,token,role));
 });
}
test('one-time invitation can be used once, without writing books',async()=>{
 const admin=user('owner1','owner@example.test');
 const first=user('link-first','first@example.com'),second=user('link-second','second@example.com');
 await assertSucceeds(setDoc(doc(admin,...linkPath(tokenA)),{
  role:'viewer',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+86400000),
  claimedByUid:'',claimedAt:null}));
 await assertSucceeds(getDoc(doc(first,...linkPath(tokenA))));
 await assertFails(getDocs(collection(first,...path('openInvites'))));
 await assertSucceeds(claim(first,tokenA,'link-first','first@example.com'));
 await assertSucceeds(getDoc(doc(first,...path('books','book1'))));
 await assertSucceeds(getDoc(doc(first,...linkPath(tokenA))));
 await assertSucceeds(setDoc(doc(first,'users','link-first'),{familyId:'familyOne'}));
 await assertFails(getDoc(doc(second,...linkPath(tokenA))));
 await assert.rejects(claim(second,tokenA,'link-second','second@example.com'),
   error=>error.code==='permission-denied'||/Unavailable/.test(error.message));
 const rejected=writeBatch(second);
 rejected.update(doc(second,...linkPath(tokenA)),{claimedByUid:'link-second',claimedAt:serverTimestamp()});
 rejected.set(doc(second,...path('members','link-second')),memberData('link-second','second@example.com',tokenA));
 await assertFails(rejected.commit());
 await assertFails(getDoc(doc(second,...path('books','book1'))));
});
test('single-document claim, forged membership, and escalation rejected',async()=>{
 const admin=user('owner1','owner@example.test'),person=user('link-role','role@example.com');
 await assertSucceeds(setDoc(doc(admin,...linkPath(tokenB)),{
  role:'viewer',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+86400000),
  claimedByUid:'',claimedAt:null}));
 await assertFails(setDoc(doc(person,...path('members','link-role')),
  memberData('link-role','role@example.com',tokenB)));
 await assertFails(updateDoc(doc(person,...linkPath(tokenB)),
  {claimedByUid:'link-role',claimedAt:serverTimestamp()}));
 await assertFails(claim(person,tokenB,'link-role','role@example.com','owner'));
 await assertFails(claim(person,tokenB,'link-role','role@example.com','editor'));
 await assertSucceeds(claim(person,tokenB,'link-role','role@example.com'));
});

test('revoked or already-expired invite cannot be redeemed',async()=>{
 const admin=user('owner1','owner@example.test');
 const visitor=user('link-revoked','revoked@example.com');
 const token='CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
 const reference=doc(admin,...linkPath(token));
 await assertFails(setDoc(reference,{
  role:'viewer',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()-3600000),
  claimedByUid:'',claimedAt:null}));
 await assertSucceeds(setDoc(reference,{
  role:'viewer',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+86400000),
  claimedByUid:'',claimedAt:null}));
 await assertSucceeds(deleteDoc(reference));
 await assert.rejects(claim(visitor,token,'link-revoked','revoked@example.com'),
   error=>error.code==='permission-denied'||/Unavailable/.test(error.message));
});

test('private family member emails can be listed only by the owner',async()=>{
  const admin=user('owner1','owner@example.test');
  const relative=user('relative2','relative2@example.test');
  await assertSucceeds(getDocs(collection(admin,...path('members'))));
  await assertSucceeds(getDoc(doc(relative,...path('members','relative2'))));
  await assertFails(getDocs(collection(relative,...path('members'))));
  await assertFails(getDoc(doc(relative,...path('members','owner1'))));
  await assertFails(getDoc(doc(user('outsider','outsider@example.test'),...path('members','relative2'))));
});
test('nicknames are readable to the family, editable by each member, and have no email field',async()=>{
  const admin=user('owner1','owner@example.test');
  const relative=user('relative2','relative2@example.test');
  const own=doc(relative,...path('publicProfiles','relative2'));
  const other=doc(admin,...path('publicProfiles','owner1'));
  await assertSucceeds(setDoc(own,{uid:'relative2',nickname:'おばあちゃん',updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(other,{uid:'owner1',nickname:'読書係',updatedAt:serverTimestamp()}));
  await assertSucceeds(getDocs(collection(relative,...path('publicProfiles'))));
  await assertSucceeds(getDoc(doc(relative,...path('publicProfiles','owner1'))));
  await assertFails(updateDoc(doc(relative,...path('publicProfiles','owner1')),
    {nickname:'勝手に変更',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(relative,...path('publicProfiles','fake-user')),
    {uid:'fake-user',nickname:'偽装',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(relative,...path('publicProfiles','relative2')),
    {uid:'relative2',nickname:'メール漏えい',email:'relative2@example.test',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(own,{nickname:'X',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(own,{nickname:'おばちゃん',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(relative,...path('members','relative2')),{role:'owner'}));
  await assertFails(getDocs(collection(user('outsider','outsider@example.test'),...path('publicProfiles'))));
});
test('owner can revoke membership and public profile in one atomic batch',async()=>{
  const admin=user('owner1','owner@example.test');
  const ownerProfile=doc(admin,...path('publicProfiles','owner1'));
  await assertFails(deleteDoc(ownerProfile));
  const memberDoc=doc(admin,...path('members','relative2'));
  const profileDoc=doc(admin,...path('publicProfiles','relative2'));
  const batch=writeBatch(admin);
  batch.delete(memberDoc);batch.delete(profileDoc);
  await assertSucceeds(batch.commit());
  await assertFails(getDocs(collection(user('relative2','relative2@example.test'),...path('publicProfiles'))));
});

test('like and reflection-request activities require matching owned reaction and can be retracted atomically',async()=>{
  const member=user('editor1','editor@example.test');
  const outsider=user('stranger','stranger@example.test');
  for(const [bucket,kind] of [['reactions','like'],['requests','ask-reflection']]){
    const reaction=doc(member,...path('books','book1',bucket,'editor1'));
    const activity=doc(member,...path('activity',kind+'-book1-editor1'));
    const record={uid:'editor1',kind,createdAt:serverTimestamp()};
    const event={actorUid:'editor1',kind,title:'テスト書籍',bookId:'book1',
      sourceId:'editor1',hidden:false,createdAt:serverTimestamp()};
    // An activity without the underlying reaction must never be accepted.
    await assertFails(setDoc(activity,event));
    await assertFails(setDoc(doc(outsider,...path('activity','unauthorized-'+kind)),event));
    // Old clients may still create an unpaired reaction. Its existence does not
    // permit invented book titles or author identities in the feed.
    await assertSucceeds(setDoc(reaction,record));
    await assertFails(setDoc(activity,{...event,title:'他の本にすり替え'}));
    await assertFails(setDoc(activity,{...event,sourceId:'owner1'}));
    await assertFails(setDoc(activity,{...event,actorUid:'owner1'}));
    await assertFails(setDoc(activity,{...event,body:'子どもの感想の本文'}));
    await assertSucceeds(deleteDoc(reaction));
    const create=writeBatch(member);
    create.set(reaction,record);create.set(activity,event);
    await assertSucceeds(create.commit());
    const stored=await getDoc(activity);
    assert.equal(stored.data().kind,kind);
    assert.equal(stored.data().sourceId,'editor1');
    assert.equal(stored.data().body,undefined);
    const remove=writeBatch(member);
    remove.delete(reaction);remove.delete(activity);
    await assertSucceeds(remove.commit());
    assert.equal((await getDoc(reaction)).exists(),false);
    assert.equal((await getDoc(activity)).exists(),false);
  }
});

test('malformed reaction activity batch fails entirely without saving reaction',async()=>{
  const member=user('editor1','editor@example.test');
  const reaction=doc(member,...path('books','book1','reactions','editor1'));
  const activity=doc(member,...path('activity','like-book1-editor1'));
  const batch=writeBatch(member);
  batch.set(reaction,{uid:'editor1',kind:'like',createdAt:serverTimestamp()});
  batch.set(activity,{actorUid:'editor1',kind:'like',title:'テスト書籍',bookId:'book1',
    sourceId:'editor1',hidden:false,createdAt:serverTimestamp(),email:'private@example.test'});
  await assertFails(batch.commit());
  assert.equal((await getDoc(reaction)).exists(),false);
  assert.equal((await getDoc(activity)).exists(),false);
});

test('owner queue can read scoped request counts and reflection presence without broadening access',async()=>{
  const owner=user('owner1','owner@example.test');
  const outsider=user('stranger','stranger@example.test');
  const qRequests=db=>query(collection(db,...path('books','book1','requests')),limit(101));
  const qReflections=db=>query(collection(db,...path('books','book1','childReflections')),limit(1));
  await assertSucceeds(getDocs(qRequests(owner)));
  await assertSucceeds(getDocs(qReflections(owner)));
  await assertFails(getDocs(qRequests(outsider)));
  await assertFails(getDocs(qReflections(outsider)));
  await assertFails(getDocs(qRequests(anonymous)));
  await assertFails(getDocs(qReflections(anonymous)));
});

test('revoked membership retains only stale user pointer until a fresh same-family invite restores access',async()=>{
  const uid='rejoin-person',email='rejoin@example.com';
  const admin=user('owner1','owner@example.test'),revoked=user(uid,email);
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'users',uid),{familyId:'familyOne'});
    await setDoc(doc(db,...path('members',uid)),{
      uid,email,displayName:'以前のメンバー',role:'viewer',joinedAt:Timestamp.now()
    });
  });
  await assertSucceeds(getDoc(doc(revoked,'users',uid)));
  await assertSucceeds(getDoc(doc(revoked,'families','familyOne')));
  await assertSucceeds(deleteDoc(doc(admin,...path('members',uid))));
  const profile=await getDoc(doc(revoked,'users',uid));
  assert.equal(profile.data().familyId,'familyOne','the old pointer is intentionally retained');
  await assertFails(getDoc(doc(revoked,'families','familyOne')));
  await assertFails(getDocs(collection(revoked,...path('books'))));
  const token='DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
  await assertSucceeds(setDoc(doc(admin,...linkPath(token)),{
    role:'viewer',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+86400000),
    claimedByUid:'',claimedAt:null
  }));
  await assertSucceeds(claim(revoked,token,uid,email));
  await assertSucceeds(setDoc(doc(revoked,'users',uid),{familyId:'familyOne'}));
  await assertSucceeds(getDoc(doc(revoked,'families','familyOne')));
  await assertSucceeds(getDocs(collection(revoked,...path('books'))));
  await assertFails(getDocs(collection(revoked,...path('members'))));
  // Removing someone again must not permanently blacklist the Google account.
  await assertSucceeds(deleteDoc(doc(admin,...path('members',uid))));
  await assertFails(getDoc(doc(revoked,'families','familyOne')));
  await assert.rejects(claim(revoked,token,uid,email),
    error=>error.code==='permission-denied'||/Unavailable/.test(error.message),
    'consumed one-time invitation cannot be reused');
  const token2='EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
  await assertSucceeds(setDoc(doc(admin,...linkPath(token2)),{
    role:'viewer',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+86400000),
    claimedByUid:'',claimedAt:null
  }));
  await assertSucceeds(claim(revoked,token2,uid,email));
  await assertSucceeds(getDoc(doc(revoked,'families','familyOne')));
  await assertSucceeds(getDocs(collection(revoked,...path('books'))));
});

test('owner withdrawal is atomic, owner-only, invisible to member reads and reversible without altering original',async()=>{
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),...path('members','archiveViewer1')),
      {uid:'archiveViewer1',email:'archive1@example.test',displayName:'Viewer',role:'viewer',joinedAt:Timestamp.now()});
  });
  const owner=user('owner1','owner@example.test'),member=user('archiveViewer1','archive1@example.test');
  const publicPath=path('books','book1','childReflections','archive-roundtrip');
  const privatePath=path('books','book1','withdrawnReflections','archive-roundtrip');
  const eventPath=path('activity','reflection-archive-roundtrip');
  const publicRef=doc(owner,...publicPath);
  const archive=doc(owner,...privatePath);
  const event=doc(owner,...eventPath);
  await assertSucceeds(setDoc(publicRef,{quote:'読んでよかった',attribution:'verbatim',
    observedAt:'2026-10',source:'owner-app',authorUid:'owner1',createdAt:serverTimestamp()}));
  await assertSucceeds(setDoc(event,{actorUid:'owner1',kind:'reflection',title:'テスト書籍',
    bookId:'book1',sourceId:'archive-roundtrip',hidden:false,createdAt:serverTimestamp()}));
  const original=(await getDoc(publicRef)).data();
  // Individual deletes, forged archives, and member access are all refused.
  await assertFails(deleteDoc(publicRef));
  await assertFails(setDoc(archive,{original,withdrawnAt:serverTimestamp(),withdrawnBy:'owner1'}));
  await assertFails(setDoc(doc(member,...privatePath),{original,withdrawnAt:serverTimestamp(),withdrawnBy:'relative2'}));
  await assertFails(getDoc(doc(member,...privatePath)));
  await assertFails(getDocs(collection(member,...path('books','book1','withdrawnReflections'))));
  await assertFails(getDoc(doc(anonymous,...privatePath)));
  const withdraw=writeBatch(owner);
  withdraw.set(archive,{original,withdrawnAt:serverTimestamp(),withdrawnBy:'owner1'});
  withdraw.delete(publicRef);
  withdraw.update(event,{hidden:true});
  await assertSucceeds(withdraw.commit());
  assert.equal((await getDoc(doc(member,...publicPath))).exists(),false);
  assert.deepEqual((await getDoc(archive)).data().original,original);
  assert.equal((await getDoc(event)).data().hidden,true);
  await assertFails(getDoc(doc(member,...privatePath)));
  await assertFails(deleteDoc(archive));
  // A restored record must match exact original fields; cannot write a fabrication.
  await assertFails(setDoc(publicRef,{...original,quote:'内容を書き換え'}));
  const restore=writeBatch(owner);
  restore.set(publicRef,original);
  restore.delete(archive);
  restore.update(event,{hidden:false});
  await assertSucceeds(restore.commit());
  assert.deepEqual((await getDoc(doc(member,...publicPath))).data(),original);
  assert.equal((await getDoc(archive)).exists(),false);
  assert.equal((await getDoc(event)).data().hidden,false);
  await assertFails(updateDoc(publicRef,{quote:'勝手に訂正'}));
});

test('archival also preserves exact admin-synced reflections lacking browser authorUid',async()=>{
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),...path('members','archiveViewer2')),
      {uid:'archiveViewer2',email:'archive2@example.test',displayName:'Viewer',role:'viewer',joinedAt:Timestamp.now()});
  });
  const owner=user('owner1','owner@example.test'),member=user('archiveViewer2','archive2@example.test');
  const publicPath=path('books','book1','childReflections','sync-preserved-reflection');
  const privatePath=path('books','book1','withdrawnReflections','sync-preserved-reflection');
  const original={quote:'親が記録した観察',attribution:'parent-summary',observedAt:'2026-10',
    source:'chatgpt-github',createdAt:Timestamp.fromMillis(1700000000000)};
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),...publicPath),original);
  });
  const publicRef=doc(owner,...publicPath),privateRef=doc(owner,...privatePath);
  const withdraw=writeBatch(owner);
  withdraw.set(privateRef,{original,withdrawnAt:serverTimestamp(),withdrawnBy:'owner1'});
  withdraw.delete(publicRef);
  await assertSucceeds(withdraw.commit());
  assert.equal((await getDoc(doc(member,...publicPath))).exists(),false);
  await assertFails(getDoc(doc(member,...privatePath)));
  const restore=writeBatch(owner);
  restore.set(publicRef,original);restore.delete(privateRef);
  await assertSucceeds(restore.commit());
  assert.deepEqual((await getDoc(publicRef)).data(),original);
});

test('withdrawal cannot smuggle altered archived text in the same batch',async()=>{
  const owner=user('owner1','owner@example.test');
  const publicPath=path('books','book1','childReflections','archive-forged');
  const privatePath=path('books','book1','withdrawnReflections','archive-forged');
  const original={quote:'そのまま残す',attribution:'verbatim',observedAt:'',
    source:'owner-app',authorUid:'owner1',createdAt:Timestamp.fromMillis(1700000000000)};
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),...publicPath),original);
  });
  const batch=writeBatch(owner);
  batch.set(doc(owner,...privatePath),{original:{...original,quote:'偽の発言'},
    withdrawnAt:serverTimestamp(),withdrawnBy:'owner1'});
  batch.delete(doc(owner,...publicPath));
  await assertFails(batch.commit());
  assert.deepEqual((await getDoc(doc(owner,...publicPath))).data(),original);
  assert.equal((await getDoc(doc(owner,...privatePath))).exists(),false);
});

test('P1 child ratings: owner writes, family sees, invalid input and owner impersonation fail',async()=>{
  // relative2 was intentionally revoked by an earlier test; editor1 is still a family member.
  const o=user('owner1','owner@example.test'),family=user('editor1','editor@example.test');
  const ref=doc(o,...path('childBookRatings','book1'));
  const sample={stars:4,enteredByUid:'owner1',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  await assertFails(setDoc(doc(family,...path('childBookRatings','book1')),sample));
  await assertFails(setDoc(ref,{...sample,stars:0}));
  await assertFails(setDoc(ref,{...sample,stars:5.5}));
  await assertFails(setDoc(ref,{...sample,extra:'payload'}));
  await assertFails(setDoc(ref,{...sample,enteredByUid:'relative2'}));
  await assertFails(setDoc(doc(o,...path('childBookRatings','missing')),sample));
  await assertSucceeds(setDoc(ref,sample));
  await assertSucceeds(getDoc(doc(family,...path('childBookRatings','book1'))));
  await assertSucceeds(getDocs(collection(family,...path('childBookRatings'))));
  await assertFails(updateDoc(doc(family,...path('childBookRatings','book1')),{stars:1,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{createdAt:serverTimestamp(),stars:3,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{stars:6,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(ref,{stars:2,updatedAt:serverTimestamp()}));
  await assertFails(deleteDoc(doc(family,...path('childBookRatings','book1'))));
  await assertSucceeds(deleteDoc(ref));
});
test('P1 child ratings do not permit rating unread books',async()=>{
  const o=user('owner1','owner@example.test');
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),...path('books','unreadCandidate')),{id:'unreadCandidate',title:'未読',status:'unread'});
  });
  await assertFails(setDoc(doc(o,...path('childBookRatings','unreadCandidate')),{stars:4,enteredByUid:'owner1',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
});

test('P1 corrected-to-unread books may have stale stars cleared but not recreated',async()=>{
  const owner=user('owner1','owner@example.test');
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),...path('childBookRatings','unreadCandidate')),
      {stars:3,enteredByUid:'owner1',createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
  });
  const ref=doc(owner,...path('childBookRatings','unreadCandidate'));
  await assertFails(updateDoc(ref,{stars:5,updatedAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(ref));
  await assertFails(setDoc(ref,{stars:4,enteredByUid:'owner1',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
});


test('P0 owner can atomically complete and rate a book without touching bibliography or reflections',async()=>{
  const old={id:'manual-owner-read',title:'試験用の本',status:'reading',readingMode:'read-aloud',
    updatedAt:'2026-10-17T01:00:00.000Z',notes:'本人の発言（保持）',coverUrl:'https://example.org/cover.png'};
  const owner=user('owner1','owner@example.test');
  const ref=doc(owner,...path('books',old.id));
  const eventId='edit-00000000-0000-4000-8000-000000000001';
  const eventRef=doc(owner,...path('books',old.id,'readingEditEvents',eventId));
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),...path('books',old.id)),old);
  });
  // The book and event must be one atomic transaction.
  await assertFails(updateDoc(ref,{status:'read',updatedAt:'2026-10-18T00:00:00.000Z'}));
  await assertFails(setDoc(eventRef,{bookId:old.id,actorUid:'owner1',editedAt:serverTimestamp()}));
  const draft={status:'read',readingMode:'read-aloud',periodKind:'day',day:'2026-10-18'};
  await assertSucceeds(runTransaction(owner,async tx=>{
    const snapshot=await tx.get(ref);
    const change=makeReadingMutation(snapshot.data(),draft,{
      eventId,updatedAt:'2026-10-18T00:00:00.001Z',
      actorUid:'owner1',editedAt:serverTimestamp()
    });
    tx.update(ref,change.patch);
    tx.set(eventRef,change.event);
  }));
  const after=(await getDoc(ref)).data();
  assert.equal(after.status,'read');
  assert.equal(after.finishedAt,'2026-10-18');
  assert.equal(after.readingMode,'read-aloud');
  assert.equal(after.notes,old.notes);
  assert.equal(after.coverUrl,old.coverUrl);
  const ev=(await getDoc(eventRef)).data();
  assert.deepEqual(ev.previous,readingSnapshot(old));
  assert.deepEqual(ev.next,readingSnapshot(after));
  assert.equal(ev.actorUid,'owner1');
  assert.equal(ev.editedAt.toMillis(),after.manualEditedAt.toMillis());
  await assertFails(updateDoc(eventRef,{actorUid:'someone-else'}));
  await assertFails(deleteDoc(eventRef));
  // Following the safe status change, the current rating rule admits the child score.
  await assertSucceeds(setDoc(doc(owner,...path('childBookRatings',old.id)),{
    stars:5,enteredByUid:'owner1',createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
});

test('P0 forged, broad or family-member reading writes are blocked',async()=>{
  const old={id:'manual-denied',title:'別の本',status:'unread',updatedAt:'2026-10-17T02:00:00.000Z'};
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),...path('books',old.id)),old);
  });
  const owner=user('owner1','owner@example.test');
  const family=user('editor1','editor@example.test');
  const bookRef=doc(owner,...path('books',old.id));
  const eventId='edit-00000000-0000-4000-8000-000000000002';
  const createChange=actor=>makeReadingMutation(old,{
    status:'reading',readingMode:'mixed',periodKind:'unknown'
  },{eventId,updatedAt:'2026-10-18T00:00:00.003Z',actorUid:actor,editedAt:serverTimestamp()});
  const attempt=async(db,extra={})=>runTransaction(db,async tx=>{
    const current=await tx.get(doc(db,...path('books',old.id)));
    const next=createChange(db===owner?'owner1':'editor1');
    tx.update(doc(db,...path('books',old.id)),{...next.patch,...extra});
    tx.set(doc(db,...path('books',old.id,'readingEditEvents',eventId)),next.event);
  });
  await assertFails(attempt(family));
  await assertFails(attempt(owner,{title:'書誌を書き換え'}));
  await assertFails(attempt(owner,{notes:'子どもの発言を上書き'}));
  await assertFails(attempt(owner,{stars:5}));
  await assertFails(attempt(owner,{finishedAt:'2026-12-01'})); // nonread may not carry completion
  assert.equal((await getDoc(bookRef)).data().status,'unread');
  assert.equal((await getDoc(doc(owner,...path('books',old.id,'readingEditEvents',eventId)))).exists(),false);
});


test('owner may correct a mistaken completion, retaining exact previous period, quotes and stars',async()=>{
  const owner=user('owner1','owner@example.test');
  const completed={id:'mistaken-read-01',title:'読了訂正の検証本',status:'read',
    readingMode:'read-aloud',finishedAt:'2026-09',finishedPeriodLabel:'2026年秋',
    finishedPeriodStart:'2026-09',finishedPeriodEnd:'2026-11',finishedPeriodPrecision:'quarter',
    finishedPeriodBasis:'parent_confirmed',finishedPeriodNote:'保護者確認',finishPrecision:'month',
    updatedAt:'2026-10-18T01:00:00.000Z',notes:'本人の言葉を変更しない',isbn:'9780000000001',readOrder:22};
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,...path('books',completed.id)),completed);
    await setDoc(doc(db,...path('childBookRatings',completed.id)),{
      stars:4,enteredByUid:'owner1',createdAt:Timestamp.now(),updatedAt:Timestamp.now()
    });
    await setDoc(doc(db,...path('books',completed.id,'childReflections','historical-quote')),{
      quote:'また読みたい',attribution:'verbatim',observedAt:'2026-09',createdAt:Timestamp.now(),
      source:'chatgpt-github'
    });
  });
  const bookRef=doc(owner,...path('books',completed.id));
  const eventId='edit-00000000-0000-4000-8000-000000000041';
  const evRef=doc(owner,...path('books',completed.id,'readingEditEvents',eventId));
  const draft={status:'unread',readingMode:'read-aloud',periodKind:'keep',correctionConfirmed:true};
  const receipt=makeReadingMutation(completed,draft,{
    eventId,updatedAt:'2026-10-19T00:00:00.000Z',
    actorUid:'owner1',editedAt:serverTimestamp()
  });
  const write=(db,patch,event)=>runTransaction(db,async tx=>{
    const ref=doc(db,...path('books',completed.id));
    const ev=doc(db,...path('books',completed.id,'readingEditEvents',eventId));
    await tx.get(ref);
    tx.update(ref,patch);
    tx.set(ev,event);
  });
  // Missing consent marker and forged markers never authorize a reversal.
  const invalid={...receipt.event};delete invalid.correctionKind;
  await assertFails(write(owner,receipt.patch,invalid));
  await assertFails(write(owner,receipt.patch,{...receipt.event,correctionKind:'reread'}));
  await assertFails(write(owner,{...receipt.patch,title:'別の本'},receipt.event));
  await assertFails(write(user('editor1','editor@example.test'),receipt.patch,receipt.event));
  await assertSucceeds(write(owner,receipt.patch,receipt.event));
  const book=(await getDoc(bookRef)).data(),event=(await getDoc(evRef)).data();
  assert.equal(book.status,'unread');
  assert.equal(book.readingMode,'');
  for(const k of ['finishedAt','finishedPeriodLabel','finishedPeriodStart','finishedPeriodEnd',
    'finishedPeriodPrecision','finishedPeriodBasis','finishedPeriodNote','finishPrecision'])assert.equal(book[k],'',k);
  assert.equal(book.notes,completed.notes);
  assert.equal(book.isbn,completed.isbn);
  assert.equal(book.readOrder,completed.readOrder);
  assert.equal(event.correctionKind,'mistaken-completion');
  assert.equal(event.previous.finishedPeriodLabel,completed.finishedPeriodLabel);
  assert.equal(event.previous.finishedPeriodNote,completed.finishedPeriodNote);
  assert.equal(event.previousUpdatedAt,completed.updatedAt);
  assert.equal(event.next.status,'unread');
  assert.equal((await getDoc(doc(owner,...path('childBookRatings',completed.id)))).data().stars,4);
  assert.equal((await getDoc(doc(owner,...path('books',completed.id,'childReflections','historical-quote')))).data().quote,'また読みたい');
  await assertFails(updateDoc(evRef,{correctionKind:'reread'}));
  await assertFails(deleteDoc(evRef));
});

test('correcting completed to reading and paused requires matching receipt and owner',async()=>{
  const owner=user('owner1','owner@example.test');
  for(const [index,status] of ['reading','paused'].entries()){
    const source={id:'mistaken-read-mode-'+index,title:'訂正状態',status:'read',readingMode:'mixed',
      finishedAt:'2026-10-18',updatedAt:'2026-10-18T02:00:00.000Z'};
    await env.withSecurityRulesDisabled(async context=>{
      await setDoc(doc(context.firestore(),...path('books',source.id)),source);
    });
    const eventId='edit-00000000-0000-4000-8000-00000000005'+index;
    const mutation=makeReadingMutation(source,{status,readingMode:'independent',correctionConfirmed:true},
      {eventId,updatedAt:'2026-10-19T00:00:00.000Z',actorUid:'owner1',editedAt:serverTimestamp()});
    await assertSucceeds(runTransaction(owner,async tx=>{
      const target=doc(owner,...path('books',source.id));
      const event=doc(owner,...path('books',source.id,'readingEditEvents',eventId));
      await tx.get(target);
      tx.update(target,mutation.patch);
      tx.set(event,mutation.event);
    }));
    const after=(await getDoc(doc(owner,...path('books',source.id)))).data();
    assert.equal(after.status,status);
    assert.equal(after.readingMode,'independent');
    assert.equal(after.finishedAt,'');
  }
});
