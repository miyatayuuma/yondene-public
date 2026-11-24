import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalIsbn,coverStatusLabel,coverIsAlternate,editionStatusLabel,
  shelfRelation,shelfRelationLabel,recommendationGroupKey,auditBookIdentities} from './bibliography-identity.mjs';
test('ISBN-10 and ISBN-13 refer to the same actual ISBN, invalid checksums are not trusted',()=>{
  assert.equal(canonicalIsbn('4591030288'),'9784591030288');
  assert.equal(canonicalIsbn('978-4-591-03028-8'),'9784591030288');
  assert.equal(canonicalIsbn('9784061882218'),'9784061882218');
  assert.equal(canonicalIsbn('9784061882219'),'');
  assert.equal(canonicalIsbn('123'),'');
});
test('cover annotations never infer physical edition from a reference image',()=>{
  const alt={coverUrl:'https://example.org/new-edition.jpg',coverEditionStatus:'known-alternate-edition-reference',
    isbnEditionStatus:'reference-edition-unverified',publicationYearBasis:'reference-edition'};
  assert.equal(coverStatusLabel(alt),'別版の参考書影');
  assert.equal(coverIsAlternate(alt),true);
  assert.match(editionStatusLabel(alt),/実物の版は未確認/);
  assert.equal(coverStatusLabel({coverUrl:'https://example.org/ref.jpg',coverEditionStatus:'same-isbn-reference-edition-unconfirmed'}),
    '同ISBNの参考書影（実物未確認）');
  assert.equal(coverStatusLabel({coverUrl:'https://example.org/ref.jpg',coverEditionStatus:'reference-edition-unconfirmed'}),'参考書影（版未確認）');
  assert.equal(coverStatusLabel({coverUrl:'https://example.org/ref.jpg'}),'参考書影（版未確認）');
  assert.equal(coverStatusLabel({}),'');
  assert.equal(editionStatusLabel({publicationYearBasis:'photo-confirmed-edition'}),
    '出版年は実物で確認（版全体は未確認）');
  assert.equal(editionStatusLabel({publicationYearBasis:'photo-confirmed-edition',isbnEditionStatus:'photo-confirmed'}),
    '実物の版を照合済み');
});
test('same title alone is a candidate, not proof of bookshelf membership',()=>{
  const shelf=[{title:'同じ名前',author:'甲',isbn:'9784591030288'}];
  assert.equal(shelfRelation({title:'同じ名前'},shelf).kind,'same-title-unverified');
  assert.match(shelfRelationLabel(shelfRelation({title:'同じ名前'},shelf)),/版未確認/);
  assert.equal(shelfRelation({title:'同じ名前',isbn:'9784591030288'},shelf).kind,'isbn-matched');
  assert.equal(shelfRelation({title:'同じ名前',isbn:'9784061882218'},shelf).kind,'same-title-unverified');
  assert.equal(shelfRelation({title:'同じ名前'},[...shelf,{title:'同じ名前',author:'乙'}]).kind,'ambiguous-title');
  assert.equal(shelfRelation({title:'別の作品'},shelf).kind,'none');
});
test('recommendations aggregate multiple recommenders of the same work',()=>{
  const a={id:'r1',title:'同じ名前',author:'甲',isbn:'9784591030288'};
  const b={id:'r2',title:'同じ名前',author:'乙',isbn:'9784061882218'};
  assert.notEqual(recommendationGroupKey(a),recommendationGroupKey(b),
    'different authors must not merge');
  assert.equal(recommendationGroupKey(a),
    recommendationGroupKey({...a,id:'r3',edition:'新版',isbn:''}),
    'same work across editions and missing ISBN must merge');
  assert.notEqual(recommendationGroupKey({id:'r1',title:'同じ名前'}),
    recommendationGroupKey({id:'r2',title:'同じ名前'}),
    'title-only must remain unmerged');
  assert.equal(recommendationGroupKey({id:'r4',title:'同じ名前',isbn:'4591030288'}),
    recommendationGroupKey({id:'r5',title:'同じ名前',isbn:'9784591030288'}),
    'ISBN fallback when author is missing');
});
test('audit detects candidates without modifying any book',()=>{
  const books=[
    {id:'a',title:'同名',isbn:'9784591030288',coverUrl:'https://example.org/a.jpg',
      coverEditionStatus:'known-alternate-edition-reference'},
    {id:'b',title:'同名',isbn:'9784061882218'},
    {id:'c',title:'別名',isbn:'9784591030288'},
    {id:'d',title:'未確認',isbn:'invalid',coverUrl:'https://example.org/ref.jpg'}
  ];
  const before=JSON.stringify(books),flags=auditBookIdentities(books);
  assert.equal(JSON.stringify(books),before);
  assert.ok(flags.some(x=>x.kind==='invalid-isbn'&&x.id==='d'));
  assert.ok(flags.some(x=>x.kind==='alternate-cover-reference'&&x.id==='a'));
  assert.ok(flags.some(x=>x.kind==='cover-edition-unverified'&&x.id==='d'));
  assert.ok(flags.some(x=>x.kind==='shared-isbn-review'&&x.ids.includes('c')));
  assert.ok(flags.some(x=>x.kind==='same-title-different-edition-or-work'&&x.ids.includes('b')));
});
