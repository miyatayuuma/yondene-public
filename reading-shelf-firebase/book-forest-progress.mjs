// The world uses only authenticated shelf snapshots. Never persist children's
// book data in the public app or send unread books into character dialogue.
export const readBooks=books=>(Array.isArray(books)?books:[]).filter(book=>book?.status==='read');

export function forestGrowth({books=[],ratings=new Map(),reflectedBookIds=new Set()}={}){
  const completed=readBooks(books);
  const rated=completed.filter(book=>Number.isInteger(ratings.get(book.id)?.stars)&&ratings.get(book.id).stars>=1&&ratings.get(book.id).stars<=5).length;
  const reflected=completed.filter(book=>reflectedBookIds.has(book.id)).length;
  // A short reflection is valuable, but a child is never required to rate or
  // explain a book to see the world change.
  const seeds=completed.length+rated+reflected*2;
  const thresholds=[0,6,16,30,50];
  let stage=0;
  thresholds.forEach((minimum,index)=>{if(seeds>=minimum)stage=index});
  return {readCount:completed.length,ratedCount:rated,reflectedCount:reflected,seeds,stage,
    nextThreshold:thresholds[stage+1]??null,stageCount:thresholds.length};
}

export function characterReadingContext(books){
  // This boundary will also be used when a dialogue API is added later.
  return readBooks(books).map(book=>({id:book.id,title:book.title}));
}
