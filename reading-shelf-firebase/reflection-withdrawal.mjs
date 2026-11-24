import {collection,doc,getDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

// Public records and private archives share a stable document ID. All three
// operations (archive, remove public, hide activity) commit atomically.
export async function withdrawReflection({db,fid,bookId,reflectionId,uid}){
  const publicRef=doc(db,'families',fid,'books',bookId,'childReflections',reflectionId);
  const privateRef=doc(db,'families',fid,'books',bookId,'withdrawnReflections',reflectionId);
  const activityRef=doc(db,'families',fid,'activity','reflection-'+reflectionId);
  const [current,activity]=await Promise.all([getDoc(publicRef),getDoc(activityRef)]);
  if(!current.exists())throw Error('この感想はすでに取り消されています。');
  const batch=writeBatch(db);
  batch.set(privateRef,{original:current.data(),withdrawnAt:serverTimestamp(),withdrawnBy:uid});
  batch.delete(publicRef);
  if(activity.exists())batch.update(activityRef,{hidden:true});
  await batch.commit();
}

export async function restoreReflection({db,fid,bookId,reflectionId}){
  const publicRef=doc(db,'families',fid,'books',bookId,'childReflections',reflectionId);
  const privateRef=doc(db,'families',fid,'books',bookId,'withdrawnReflections',reflectionId);
  const activityRef=doc(db,'families',fid,'activity','reflection-'+reflectionId);
  const [archived,activity]=await Promise.all([getDoc(privateRef),getDoc(activityRef)]);
  if(!archived.exists())throw Error('復元対象の記録が見つかりません。');
  const batch=writeBatch(db);
  batch.set(publicRef,archived.data().original);
  batch.delete(privateRef);
  if(activity.exists())batch.update(activityRef,{hidden:false});
  await batch.commit();
}
