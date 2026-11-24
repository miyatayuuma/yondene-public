import test from 'node:test';
import assert from 'node:assert/strict';
import {isPermissionDenied,staleMembershipRoute} from './startup-recovery.mjs';

test('only Firestore permission-denied is classified as lost family access',()=>{
  assert.equal(isPermissionDenied({code:'permission-denied'}),true);
  assert.equal(isPermissionDenied({code:'firestore/permission-denied'}),true);
  assert.equal(isPermissionDenied({code:'unavailable'}),false);
  assert.equal(isPermissionDenied({code:'unauthenticated'}),false);
  assert.equal(isPermissionDenied(null),false);
});
test('a stale family pointer can be recovered only by a fresh invite to that family',()=>{
  assert.equal(staleMembershipRoute({storedFamilyId:'f1'}),'request-new-invite');
  assert.equal(staleMembershipRoute({storedFamilyId:'f1',openInviteFamilyId:'f1'}),'one-time-invite');
  assert.equal(staleMembershipRoute({storedFamilyId:'f1',emailInviteFamilyId:'f1'}),'email-invite');
  assert.equal(staleMembershipRoute({storedFamilyId:'f1',openInviteFamilyId:'f2'}),'different-family');
  assert.equal(staleMembershipRoute({storedFamilyId:'f1',emailInviteFamilyId:'f2'}),'different-family');
  assert.equal(staleMembershipRoute({storedFamilyId:''}),'no-stored-family');
});
