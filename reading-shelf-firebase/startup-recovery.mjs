// A previously removed family member can retain their own users/{uid} pointer.
// Recovery must require a *fresh* invitation for the exact same family. This
// function never grants or bypasses Firestore access.
export function isPermissionDenied(error){
  return ['permission-denied','firestore/permission-denied'].includes(error?.code);
}
export function staleMembershipRoute({storedFamilyId,openInviteFamilyId='',emailInviteFamilyId=''}){
  if(!storedFamilyId)return 'no-stored-family';
  if(openInviteFamilyId===storedFamilyId)return 'one-time-invite';
  if(emailInviteFamilyId===storedFamilyId)return 'email-invite';
  if(openInviteFamilyId||emailInviteFamilyId)return 'different-family';
  return 'request-new-invite';
}
