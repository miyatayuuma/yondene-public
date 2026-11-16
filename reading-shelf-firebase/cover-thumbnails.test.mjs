import test from 'node:test';
import assert from 'node:assert/strict';
import {shelfThumbnailUrl} from './cover-thumbnails.mjs';
test('known Shopify image CDN requests 320px instead of 1946/1100px',()=>{
  for(const domain of ['shop.douwakan.co.jp','store.fukuinkan.co.jp']){
    const img=new URL(shelfThumbnailUrl('https://'+domain+'/cdn/shop/files/book.jpg?v=1&width=1946'));
    assert.equal(img.searchParams.get('width'),'320');
    assert.equal(img.searchParams.get('v'),'1');
  }
});
test('Amazon 1000px covers request a lighter 320px variant while preserving format',()=>{
  const variants=[
    ['https://m.media-amazon.com/images/I/synthetic-cover-01._AC_UF1000,1000_QL80_.jpg',
     'https://m.media-amazon.com/images/I/synthetic-cover-01._AC_UF320,320_QL75_.jpg'],
    ['https://m.media-amazon.com/images/I/synthetic-cover-02._AC_UF1000,1000_QL80_FMwebp_.jpg',
     'https://m.media-amazon.com/images/I/synthetic-cover-02._AC_UF320,320_QL75_FMwebp_.jpg']
  ];
  for(const [source,expected] of variants)assert.equal(shelfThumbnailUrl(source),expected);
});
test('unknown hosts, paths and valid small covers are unchanged',()=>{
  for(const url of ['https://unknown.example/cdn/shop/files/book.jpg?width=1946',
   'https://shop.douwakan.co.jp/cdn/shop/files/book.jpg?width=180',
   'https://shop.douwakan.co.jp/other/book.jpg?width=1800',
   'data:image/jpeg;base64,YQ==','https://www.crayonhouse.co.jp/img/goods/L/example.jpg'])
    assert.equal(shelfThumbnailUrl(url),url);
});
