import test from 'node:test';
import assert from 'node:assert/strict';
import {
 normalizeFleet, dispatchError, receiptError, applyReceipt, resolveDispute,
 isExplicitReceipt, receiptMetrics, workOrderProgress, completionError, receiptTolerance
} from '../src/operations.ts';

const site={id:'S-1',safetyReview:true};
const order={id:'WO-1',siteId:'S-1',status:'approved',targetVolume:40};
const vehicle={code:'TRK-05',capacityM3:20,active:true,kind:'demo'};
const base={id:'TR-1',orderId:'WO-1',vehicle:'TRK-05',volume:12,facility:'A',status:'pending',date:'2026-11-02'};
const markedLegacy={...base,id:'TR-OLD',status:'received'};

test('v0.1 backups recover vehicle registry without losing old vehicle codes',()=>{
 const fleet=normalizeFleet(undefined,[base,{...base,vehicle:'TRK-99'}]);
 assert.ok(fleet.some(x=>x.code==='TRK-99'));
 assert.ok(fleet.some(x=>x.code==='TRK-01'));
 const custom=normalizeFleet([{code:'TRK-CUSTOM',capacityM3:19,active:false,kind:'Demo'}],[base]);
 assert.equal(custom.find(x=>x.code==='TRK-CUSTOM').capacityM3,19);
 assert.ok(custom.some(x=>x.code==='TRK-05'));
});
test('dispatch rejects unsafe, inactive, over-capacity and duplicate pending vehicles',()=>{
 assert.equal(dispatchError(order,site,vehicle,12,[]),null);
 assert.match(dispatchError(order,{...site,safetyReview:false},vehicle,12,[]),/سلامة/);
 assert.match(dispatchError(order,site,{...vehicle,active:false},12,[]),/موقوفة/);
 assert.match(dispatchError(order,site,vehicle,25,[]),/سعة/);
 assert.match(dispatchError(order,site,vehicle,10,[base]),/بانتظار/);
 assert.match(dispatchError(order,site,vehicle,10,[{...base,status:'received',volume:35}]),/تتجاوز/);
 assert.match(dispatchError({...order,status:'draft'},site,vehicle,10,[]),/ليس معتمدًا/);
});
test('a separate receipt measurement and reference is required',()=>{
 assert.match(receiptError(base,12,'',[base]),/محضر/);
 assert.equal(receiptError(base,11.8,'REC-NEW',[base]),null);
 assert.match(receiptError(base,12,'REC-X',[{...base,id:'TR-OTHER',receiptRef:'rec-x'}]),/مسجل/);
});
test('receipt within tolerance is counted from received volume, not loaded volume',()=>{
 assert.equal(receiptTolerance(12),0.6);
 const receipt=applyReceipt(base,11.5,'REC-01','2026-11-02');
 assert.equal(receipt.status,'received');
 assert.equal(receipt.receivedVolume,11.5);
 assert.equal(receipt.discrepancyM3,-0.5);
 assert.equal(isExplicitReceipt(receipt),true);
 const metrics=receiptMetrics([receipt,markedLegacy,base]);
 assert.equal(metrics.loadedM3,36);
 assert.equal(metrics.confirmedM3,11.5);
 assert.equal(metrics.legacyM3,12);
 assert.equal(metrics.pendingM3,12);
});
test('large discrepancies remain disputed until a documented demo resolution',()=>{
 const mismatch=applyReceipt(base,9,'REC-DIFF','2026-11-02');
 assert.equal(mismatch.status,'disputed');
 assert.equal(receiptMetrics([mismatch]).confirmedM3,0);
 assert.throws(()=>resolveDispute(mismatch,'short','2026-11-02'));
 const settled=resolveDispute(mismatch,'قياس تجريبي مختلف تم مراجعته','2026-11-02');
 assert.equal(settled.status,'received');
 assert.equal(settled.volume,12);
 assert.equal(settled.receivedVolume,9);
 assert.equal(receiptMetrics([settled]).confirmedM3,9);
});
test('order completion requires measured receipts and no pending or legacy rows',()=>{
 const good=applyReceipt(base,12,'REC-01','2026-11-02');
 assert.equal(completionError(order,site,[good]),null);
 assert.match(completionError(order,site,[good,markedLegacy]),/قديمة/);
 assert.match(completionError(order,site,[good,base]),/معلقة/);
 assert.match(completionError(order,{...site,safetyReview:false},[good]),/سلامة/);
 assert.match(completionError(order,site,[]),/لا توجد/);
 const progress=workOrderProgress(order,[good]);
 assert.equal(progress.progressPercent,30);
 assert.equal(progress.remainingM3,28);
});
