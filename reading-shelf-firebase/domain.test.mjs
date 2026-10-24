import test from 'node:test';
import assert from 'node:assert/strict';
import {STATUSES,INTEREST_SHELF_STATUS,ACTIVE_READ_FILTER,isInterestBook,newBook,sortBooks,filteredBooks,validateBackup,normalizeBook,validDate,validatePeriodUpdates,readPeriodLabel,compactReadPeriodLabel,readPeriodGrouping,readPeriodSortKey,readingModeLabel,READING_MODES,emptyStateMessage} from './domain.mjs';

test('book statuses remain distinct',()=>{
  assert.deepEqual(Object.keys(STATUSES),['read','reading','paused','unread']);
});
test('sort puts unknown dates after known dates',()=>{
  const data=[{title:'Unknown',finishedAt:''},{title:'Old',finishedAt:'2025-12'},{title:'New',finishedAt:'2026-10'}];
  assert.deepEqual(sortBooks(data,'read-new').map(x=>x.title),['New','Old','Unknown']);
  assert.deepEqual(sortBooks(data,'read-old').map(x=>x.title),['Old','New','Unknown']);
});
test('author and title sorting uses Japanese reading where present',()=>{
  const data=[{title:'B',titleKana:'い',author:'B',authorKana:'い'},{title:'A',titleKana:'あ',author:'A',authorKana:'あ'}];
  assert.deepEqual(sortBooks(data,'title-asc').map(x=>x.title),['A','B']);
  assert.deepEqual(sortBooks(data,'author-desc').map(x=>x.title),['B','A']);
});
test('series and filtered search retain unread',()=>{
  const books=[{id:'a',title:'ねこと王さま',status:'read',seriesId:'cat'},
    {id:'b',title:'ねこと王さま しごとをさがす',status:'unread',seriesId:'cat'}];
  assert.equal(filteredBooks(books,{search:'ねこと王さま',filter:'all'},[{id:'cat',name:'ねこと王さま'}]).length,2);
  assert.equal(filteredBooks(books,{filter:'read'},[]).length,1);
});
test('validateBackup rejects repeated IDs and unexpected statuses',()=>{
  const good={version:1,books:[{id:'a',title:'赤毛のアン',status:'read'}],series:[{id:'s',name:'シリーズ'}]};
  assert.equal(validateBackup(good).books.length,1);
  assert.throws(()=>validateBackup({...good,books:[good.books[0],good.books[0]]}),/ID/);
  assert.throws(()=>validateBackup({...good,books:[{...good.books[0],status:'invalid'}]}),/不正/);
});
test('dates are explicit and unknown is not invented',()=>{
  assert.equal(validDate('2026-10'),true);
  assert.equal(validDate('2026-10-15'),true);
  assert.equal(validDate('2026-13'),false);
  assert.equal(validDate('2026-00'),false);
  assert.equal(validDate(''),true);
  assert.equal(normalizeBook({title:'a',status:'read'}).finishedAt,'');
});
test('rejects script URLs in cover and preserves book edition metadata',()=>{
  assert.throws(()=>normalizeBook({id:'a',title:'a',status:'read',coverUrl:'javascript:alert(1)'}),/HTTPS/);
  const obj=normalizeBook({id:'a',title:'赤毛のアン',edition:'ビジュアル特別版',adaptedBy:'松本侑子',status:'read',coverUrl:'https://example.org/anne.jpg'});
  assert.equal(obj.edition,'ビジュアル特別版');
  assert.equal(obj.adaptedBy,'松本侑子');
});

test('school terms preserve unknown month instead of inventing a completion date',()=>{
  const b=normalizeBook({title:'ねこと王さま',status:'read',finishedAt:'',finishedPeriodLabel:'2026年度・小1・2学期',
    finishedPeriodStart:'2026-09',finishedPeriodEnd:'2026-10'});
  assert.equal(b.finishedAt,'');
  assert.equal(b.finishedPeriodLabel,'2026年度・小1・2学期');
  assert.equal(b.finishedPeriodStart,'2026-09');
  assert.equal(b.finishedPeriodEnd,'2026-10');
});
test('bad ranges are rejected',()=>{
  assert.throws(()=>normalizeBook({title:'a',status:'read',finishedPeriodStart:'2026-10',finishedPeriodEnd:'2026-09'}),/開始/);
  assert.throws(()=>normalizeBook({title:'a',status:'read',finishedPeriodStart:'2026-09'}),/開始/);
  assert.throws(()=>normalizeBook({title:'a',status:'unread',finishedPeriodStart:'2026-09',finishedPeriodEnd:'2026-09'}),/未読/);
});
test('period labels and chronological sorting retain historical reading order',()=>{
  const list=[
    {title:'先に読了',status:'read',finishedPeriodStart:'2026-09',finishedPeriodLabel:'2026年度・小1・2学期',readOrder:15},
    {title:'後に読了',status:'read',finishedAt:'2026-09',finishedPeriodStart:'2026-09',finishedPeriodLabel:'2026年9月',readOrder:16},
    {title:'夏休み',status:'read',finishedPeriodStart:'2026-07',finishedPeriodLabel:'2026年・夏休み',readOrder:3}
  ];
  assert.deepEqual(sortBooks(list,'read-new').map(x=>x.title),['後に読了','先に読了','夏休み']);
});

test('period patch validates unique IDs, precision and month bounds',()=>{
  const base={schemaVersion:1,type:'reading-period-update',books:[{id:'initial-01',title:'星モグラサンジの伝説',
    finishedPeriodStart:'2025-04',finishedPeriodEnd:'2026-03',finishedPeriodLabel:'2025年度・年長',
    finishedPeriodPrecision:'school_year',finishedPeriodBasis:'parent_retrospective_2026-10-15'}]};
  assert.equal(validatePeriodUpdates(base).length,1);
  assert.throws(()=>validatePeriodUpdates({...base,books:[base.books[0],base.books[0]]}),/重複/);
  assert.throws(()=>validatePeriodUpdates({...base,books:[{...base.books[0],finishedPeriodEnd:'2024-04'}]}),/年月/);
});

test('natural reading labels and read-order sorting remain accurate',()=>{
  assert.deepEqual(Object.values(STATUSES),['読んだ','読んでる','お休み中','きになる']);
  const books=[
    {title:'前',status:'read',readOrder:5,finishedPeriodStart:'2026-10'},
    {title:'後',status:'read',readOrder:7,finishedPeriodStart:'2026-09'},
    {title:'未登録順',status:'unread',readOrder:null}
  ];
  assert.deepEqual(sortBooks(books,'order-new').map(b=>b.title),['前','後','未登録順']);
  assert.deepEqual(sortBooks(books,'order-old').map(b=>b.title),['後','前','未登録順']);
});

test('reading modes are explicit facts, not defaults inferred from unread status',()=>{
  assert.equal(readingModeLabel({readingMode:'read-aloud'}),'読み聞かせ');
  assert.equal(readingModeLabel({readingMode:'independent'}),'自力読書');
  assert.equal(readingModeLabel({readingMode:'mixed'}),'併用');
  assert.equal(readingModeLabel({}),'');
  assert.equal(readingModeLabel({readingMode:'unknown'}),'');
  assert.equal(Object.keys(READING_MODES).length,3);
});

test('empty state distinguishes no search result from an empty series and reading period',()=>{
  assert.equal(emptyStateMessage({view:'series',search:''}),'シリーズに登録された本はまだありません。');
  assert.equal(emptyStateMessage({view:'series',search:'  赤毛  '}),'検索に一致する本はありません。検索語を変えてお試しください。');
  assert.equal(emptyStateMessage({view:'shelf',search:'単語'}),'検索に一致する本はありません。検索語を変えてお試しください。');
  assert.equal(emptyStateMessage({view:'shelf',hasBooks:false}),'本棚にはまだ本が登録されていません。');
  assert.equal(emptyStateMessage({view:'shelf',hasBooks:true}),'この条件に当てはまる本はありません。');
});

test('report dates render consistently and retain exact chronological order despite missing readOrder',()=>{
  const books=[
    {title:'昨年',status:'read',finishedAt:'2025-11',readOrder:30},
    {title:'今月1日',status:'read',finishedAt:'2026-10-01'},
    {title:'バクのバンバン',status:'read',finishedAt:'2026-10-16',readOrder:null},
    {title:'今月17日',status:'read',finishedAt:'2026-10-17',readOrder:null},
    {title:'時期未登録',status:'read',finishedAt:'',readOrder:100},
    {title:'9月',status:'read',finishedAt:'2026-09',readOrder:99}
  ];
  assert.deepEqual(sortBooks(books,'order-new').map(b=>b.title),['今月17日','バクのバンバン','今月1日','9月','昨年','時期未登録']);
  assert.deepEqual(sortBooks(books,'read-new').map(b=>b.title),['今月17日','バクのバンバン','今月1日','9月','昨年','時期未登録']);
  assert.deepEqual(sortBooks(books,'order-old').map(b=>b.title),['昨年','9月','今月1日','バクのバンバン','今月17日','時期未登録']);
  assert.equal(readPeriodLabel(books[2]),'2026年10月16日');
  assert.equal(readPeriodLabel(books[5]),'2026年9月');
  assert.equal(readPeriodGrouping(books[2]),'2026年10月');
  assert.equal(readPeriodGrouping(books[1]),'2026年10月');
  assert.equal(readPeriodSortKey(books[2]),'2026-10-16');
  assert.equal(readPeriodSortKey(books[5]),'2026-09-01');
});
test('historical term and same-month readOrder tie breaks remain stable',()=>{
  const books=[
    {title:'学期',status:'read',finishedPeriodStart:'2026-09',finishedPeriodEnd:'2026-10',finishedPeriodLabel:'2026年度2学期',readOrder:3},
    {title:'同月後',status:'read',finishedAt:'2026-09',readOrder:5},
    {title:'同月先',status:'read',finishedAt:'2026-09',readOrder:1},
    {title:'不明',status:'read',readOrder:11}
  ];
  assert.deepEqual(sortBooks(books,'order-new').map(b=>b.title),['同月後','学期','同月先','不明']);
  assert.equal(readPeriodLabel(books[0]),'2026年度2学期');
  assert.equal(readPeriodSortKey(books[0]),'2026-09-01');
});

test('unread and interested books share a single persisted app state',()=>{
  assert.equal(INTEREST_SHELF_STATUS,'unread');
  assert.equal(STATUSES.unread,'きになる');
  assert.deepEqual(Object.keys(STATUSES),['read','reading','paused','unread']);
  const interest={id:'library',title:'学級文庫で見つけた本',status:'unread',notes:'学級文庫で見つけ、気になった。'};
  const notYetInterested={id:'older',title:'他の未読本',status:'unread',notes:''};
  const inProgress={id:'started',title:'読み始めた本',status:'reading',notes:'学級文庫で見つけ、気になった。'};
  const other={id:'read',title:'読了本',status:'read'};
  const shelf=[interest,notYetInterested,inProgress,other];
  assert.equal(isInterestBook(interest),true);
  assert.equal(isInterestBook(notYetInterested),true);
  assert.equal(isInterestBook(inProgress),false);
  assert.equal(isInterestBook(null),false);
  assert.deepEqual(filteredBooks(shelf,{filter:'unread'}).map(x=>x.id).sort(),['library','older']);
  assert.deepEqual(filteredBooks(shelf,{filter:'all'}).map(x=>x.id).sort(),['library','older','read','started']);
  assert.deepEqual(filteredBooks(shelf,{filter:'reading'}).map(x=>x.id),['started']);
  assert.equal(normalizeBook(interest).status,'unread');
  assert.equal(normalizeBook(interest).notes,interest.notes);
  const continued=normalizeBook({...interest,status:'reading'});
  assert.equal(continued.notes,interest.notes);
  assert.equal(continued.status,'reading');
  assert.throws(()=>normalizeBook({...interest,status:'interested'}),/読書状況/);
  assert.throws(()=>normalizeBook({...interest,status:'wishlist'}),/読書状況/);
  assert.throws(()=>validateBackup({version:1,books:[{...interest,status:'interested'}],series:[]}),/読書状況/);
});

test('unread book drafts never infer a reading method from interest alone',()=>{
  const draft=newBook();
  assert.equal(draft.status,INTEREST_SHELF_STATUS);
  assert.equal(draft.readingMode,'');
  assert.equal(readingModeLabel(draft),'');
});

test('v19: active-read filter contains reading and read only, with reading pinned above sorted completed',()=>{
  const shelf=[
    {id:'r1',title:'あ・読書中',status:'reading',publicationYear:2000},
    {id:'r2',title:'ん・読書中',status:'reading',publicationYear:1999},
    {id:'d1',title:'い・読了',status:'read',finishedAt:'2026-09',publicationYear:2026},
    {id:'d2',title:'う・読了',status:'read',finishedAt:'2026-10',publicationYear:2018},
    {id:'p',title:'お休み',status:'paused',publicationYear:2027},
    {id:'u',title:'未読',status:'unread',publicationYear:2028}
  ];
  assert.equal(ACTIVE_READ_FILTER,'active-read');
  assert.deepEqual(filteredBooks(shelf,{}).map(b=>b.id),['r1','r2','d2','d1']);
  assert.deepEqual(filteredBooks(shelf,{filter:ACTIVE_READ_FILTER,sort:'title-asc'}).map(b=>b.id),
    ['r1','r2','d1','d2']);
  for(const sort of ['order-new','order-old','title-asc','author-asc','year-new','year-old']){
    const result=filteredBooks(shelf,{filter:ACTIVE_READ_FILTER,sort});
    assert.deepEqual(result.slice(0,2).map(x=>x.status),['reading','reading'],sort);
    assert.deepEqual(result.slice(2).map(x=>x.status),['read','read'],sort);
  }
  assert.deepEqual(filteredBooks(shelf,{filter:'read'}).map(b=>b.id),['d2','d1']);
  assert.deepEqual(filteredBooks(shelf,{filter:'reading'}).map(b=>b.id),['r1','r2']);
  assert.deepEqual(filteredBooks(shelf,{filter:'unread'}).map(b=>b.id),['u']);
  assert.deepEqual(filteredBooks(shelf,{filter:'paused'}).map(b=>b.id),['p']);
  assert.deepEqual(filteredBooks(shelf,{filter:'all',sort:'year-new'}).map(b=>b.id),
    ['u','p','d1','d2','r1','r2']);
  assert.deepEqual(filteredBooks(shelf,{search:'読書中'}).map(b=>b.id),['r1','r2']);
  assert.deepEqual(filteredBooks(shelf,{search:'読了'}).map(b=>b.id),['d2','d1']);
  assert.deepEqual(Object.keys(STATUSES),['read','reading','paused','unread']);
});

test('v19: combined default shelf shows completed books even when nothing is being read',()=>{
  const shelf=[{id:'read',title:'完了',status:'read'},{id:'unread',title:'未読',status:'unread'}];
  assert.deepEqual(filteredBooks(shelf).map(b=>b.id),['read']);
  assert.equal(emptyStateMessage({view:'shelf',hasBooks:true}),'この条件に当てはまる本はありません。');
});

test('P2: card labels reflect known date, season, year, and unknown periods',()=>{
  const read=(fields={})=>({status:'read',...fields});
  assert.equal(compactReadPeriodLabel(read({finishedAt:'2026-10-16'})),'2026.10');
  assert.equal(compactReadPeriodLabel(read({finishedAt:'2026-09'})),'2026.09');
  assert.equal(compactReadPeriodLabel(read({finishedPeriodLabel:'2026年10月16日'})),'2026.10');
  assert.equal(compactReadPeriodLabel(read({finishedPeriodLabel:'2026年・夏休み',finishedPeriodStart:'2026-07',finishedPeriodEnd:'2026-08'})),'2026.夏');
  assert.equal(compactReadPeriodLabel(read({finishedPeriodLabel:'2026年春'})),'2026.春');
  assert.equal(compactReadPeriodLabel(read({finishedPeriodLabel:'2025年'})),'2025');
  assert.equal(compactReadPeriodLabel(read({finishedPeriodLabel:'2026年度・小1・2学期',finishedPeriodStart:'2026-09',finishedPeriodEnd:'2026-10'})),'2026');
  assert.equal(compactReadPeriodLabel(read({finishedPeriodLabel:'2026年度・冬休み',finishedPeriodStart:'2026-12',finishedPeriodEnd:'2027-01'})),'');
  assert.equal(compactReadPeriodLabel(read({finishedPeriodLabel:'時期不明'})),'');
  assert.equal(compactReadPeriodLabel(read({})),'');
  assert.equal(compactReadPeriodLabel({status:'reading',finishedAt:'2026-10-16'}),'');
  assert.equal(compactReadPeriodLabel({status:'unread',finishedAt:'2026-10-16'}),'');
  assert.equal(compactReadPeriodLabel(read({finishedPeriodLabel:'10月ころ'})),'');
});
test('P2: parent confirmed historical refinements are strictly bound to record identity',()=>{
  const sanji={id:'initial-01',title:'星モグラサンジの伝説',status:'read',finishedPeriodLabel:'2025年度・年長',
    finishedPeriodStart:'2025-04',finishedPeriodEnd:'2026-03',finishedAt:''};
  const totto={id:'initial-02',title:'窓ぎわのトットちゃん',status:'read',finishedPeriodLabel:'2026年度・小1・1学期',
    finishedPeriodStart:'2026-04',finishedPeriodEnd:'2026-07',finishedAt:''};
  assert.equal(compactReadPeriodLabel(sanji),'2025');
  assert.equal(compactReadPeriodLabel(totto),'2026.春');
  assert.notEqual(compactReadPeriodLabel({...sanji,id:'new-id'}),'2025');
  assert.notEqual(compactReadPeriodLabel({...totto,title:'別の本'}),'2026.春');
  assert.notEqual(compactReadPeriodLabel({...totto,finishedAt:'2026-06-10'}),'2026.春');
  assert.notEqual(compactReadPeriodLabel({...totto,finishedPeriodLabel:'2026年10月'}),'2026.春');
  assert.equal(readPeriodLabel(sanji),'2025年度・年長');
  assert.equal(readPeriodLabel(totto),'2026年度・小1・1学期');
  assert.equal(readPeriodSortKey(sanji),'2025-04-01');
});

test('P3: six sorts and four shelf filters retain behavior with and without publication year',()=>{
  const books=[
    {id:'r',title:'甲',titleKana:'あ',author:'作者甲',authorKana:'あ',status:'reading',publicationYear:2015},
    {id:'a',title:'乙',titleKana:'い',author:'作者乙',authorKana:'い',status:'read',finishedAt:'2026-10',publicationYear:2020},
    {id:'b',title:'丙',titleKana:'う',author:'作者丙',authorKana:'う',status:'read',finishedAt:'2025-10',publicationYear:1998},
    {id:'p',title:'丁',titleKana:'え',status:'paused'},
    {id:'u',title:'戊',titleKana:'お',status:'unread',publicationYear:null}
  ];
  const sorts=['order-new','order-old','title-asc','author-asc','year-new','year-old'];
  for(const sort of sorts){
    assert.deepEqual(filteredBooks(books,{filter:ACTIVE_READ_FILTER,sort}).map(b=>b.id).slice(0,1),['r']);
    assert.equal(filteredBooks(books,{filter:'all',sort}).length,5);
    assert.deepEqual(filteredBooks(books,{filter:'paused',sort}).map(b=>b.id),['p']);
    assert.deepEqual(filteredBooks(books,{filter:'unread',sort}).map(b=>b.id),['u']);
  }
  assert.deepEqual(sortBooks(books,'year-new').map(b=>b.id),['a','r','b','p','u']);
  assert.deepEqual(sortBooks(books,'year-old').map(b=>b.id),['b','r','a','p','u']);
  assert.deepEqual(filteredBooks(books,{filter:'all',search:'作者乙',sort:'year-new'}).map(b=>b.id),['a']);
  assert.deepEqual(filteredBooks(books,{filter:ACTIVE_READ_FILTER,sort:'year-new'}).map(b=>b.id),['r','a','b']);
});

test('P1: rating sort ranks evaluated books, with missing scores last and stable ties',()=>{
  const books=[
    {id:'u',title:'未評価',status:'read'},
    {id:'a',title:'古い5',status:'read',childRating:5,finishedAt:'2025-08'},
    {id:'b',title:'新しい5',status:'read',childRating:5,finishedAt:'2026-09'},
    {id:'c',title:'読書中4',status:'reading',childRating:4},
    {id:'d',title:'低め1',status:'read',childRating:1},
    {id:'x',title:'無効値',status:'read',childRating:0}
  ];
  assert.deepEqual(sortBooks(books,'rating-high').map(b=>b.id),['b','a','c','d','u','x']);
  assert.deepEqual(filteredBooks(books,{sort:'rating-high'}).map(b=>b.id),['b','a','c','d','u','x']);
  assert.equal(filteredBooks(books,{sort:'order-new'})[0].id,'c');
});
