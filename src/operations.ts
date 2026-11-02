/**
 * RukamGIS v0.3 — LOCAL DEMO dispatch / receiving ledger.
 * No authenticated approval, telemetry, or evidence verification exists here.
 * Volumes are cubic metres; loaded and explicitly received volumes are distinct.
 */
import type { Site, WorkOrder, Trip, FleetVehicle } from './data';

export const RECEIPT_TOLERANCE_PERCENT=5;
export const RECEIPT_TOLERANCE_MIN_M3=0.5;
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const round=(n:number)=>Math.round(n*100)/100;
export function makeFleet(trips:Trip[]):FleetVehicle[] {
 const set=new Set(['TRK-01','TRK-02','TRK-03','TRK-04']);
 for(const t of trips)if(typeof t.vehicle==='string'&&t.vehicle.trim())set.add(t.vehicle.trim().toUpperCase());
 return Array.from(set).map(code=>({code,capacityM3:30,active:true,kind:'شاحنة تجريبية'}));
}
export function normalizeFleet(input:unknown,trips:Trip[]):FleetVehicle[] {
 const base=makeFleet(trips);
 if(!Array.isArray(input))return base;
 const seen=new Set<string>();
 const vehicles:FleetVehicle[]=[];
 for(const x of input){
  if(!x||typeof x!=='object')continue;
  const v=x as Partial<FleetVehicle>;
  if(typeof v.code!=='string'||!v.code.trim()||v.code.length>32||
     !positive(v.capacityM3)||v.capacityM3>1000||typeof v.active!=='boolean')continue;
  const code=v.code.trim().toUpperCase();
  if(seen.has(code))continue;
  seen.add(code);
  vehicles.push({code,capacityM3:v.capacityM3,active:v.active,kind:typeof v.kind==='string'?v.kind.slice(0,60):''});
 }
 // Older backup files had trips but no fleet register. Restore these as legacy demo records.
 for(const x of base)if(!seen.has(x.code))vehicles.push(x);
 return vehicles;
}
export function dispatchError(order:WorkOrder|undefined,site:Site|undefined,vehicle:FleetVehicle|undefined,
 volume:number,trips:Trip[]):string|null {
 if(!order||!site||order.siteId!==site.id)return 'أمر العمل أو موقعه غير متاح';
 if(!site.safetyReview)return 'الموقع لم يستكمل محاكاة مراجعة السلامة';
 if(order.status!=='approved'&&order.status!=='active')return 'أمر العمل ليس معتمدًا أو نشطًا';
 if(!vehicle||!vehicle.active)return 'المركبة غير مسجلة أو موقوفة';
 if(!positive(volume)||volume>1000000)return 'كمية التحميل غير صالحة';
 if(volume>vehicle.capacityM3+.001)return 'كمية التحميل تتجاوز السعة المسجلة للمركبة';
 if(trips.some(t=>t.vehicle.toUpperCase()===vehicle.code&&t.status==='pending'))return 'لدى المركبة حمولة أخرى بانتظار الاستلام';
 const total=trips.filter(t=>t.orderId===order.id).reduce((s,t)=>s+(positive(t.volume)?t.volume:0),0);
 if(total+volume>order.targetVolume+0.001)return 'الكمية الإجمالية المحمّلة تتجاوز الكمية المستهدفة لأمر العمل';
 return null;
}
export function receiptTolerance(loaded:number):number {
 return Math.max(RECEIPT_TOLERANCE_MIN_M3,loaded*RECEIPT_TOLERANCE_PERCENT/100);
}
export function receiptError(trip:Trip,receivedVolume:number,ref:string,otherTrips:Trip[]):string|null {
 if(trip.status!=='pending')return 'الحمولة ليست بانتظار الاستلام';
 if(!positive(receivedVolume)||receivedVolume>1000000)return 'كمية الاستلام غير صالحة';
 if(!ref.trim()||ref.trim().length<3||ref.trim().length>60)return 'أدخل رقم محضر استلام تجريبي من 3 إلى 60 حرفًا';
 if(otherTrips.some(x=>x.id!==trip.id&&x.receiptRef?.trim().toUpperCase()===ref.trim().toUpperCase()))return 'رقم المحضر مسجل لحمولة أخرى';
 return null;
}
export function applyReceipt(trip:Trip,receivedVolume:number,receiptRef:string,at:string):Trip {
 const delta=round(receivedVolume-trip.volume);
 const mismatch=Math.abs(delta)>receiptTolerance(trip.volume)+.0001;
 return {...trip,status:mismatch?'disputed':'received',receivedVolume:round(receivedVolume),
  receiptRef:receiptRef.trim(),receivedAt:at,discrepancyM3:delta,reconciliationNote:undefined,reconciledAt:undefined};
}
export function resolveDispute(trip:Trip,note:string,at:string):Trip {
 if(trip.status!=='disputed'||!positive(trip.receivedVolume)||!trip.receiptRef)
  throw new Error('لا توجد مطابقة كمية معلقة قابلة للتسوية');
 if(note.trim().length<12)throw new Error('دوّن سبب التسوية والمراجعة في 12 حرفًا على الأقل');
 return {...trip,status:'received',reconciliationNote:note.trim(),reconciledAt:at};
}
export function isExplicitReceipt(trip:Trip):boolean {
 return trip.status==='received'&&positive(trip.receivedVolume)&&typeof trip.receiptRef==='string'&&trip.receiptRef.trim().length>=3;
}
export function receiptMetrics(trips:Trip[]){
 const pending=trips.filter(t=>t.status==='pending');
 const disputed=trips.filter(t=>t.status==='disputed');
 const explicit=trips.filter(isExplicitReceipt);
 const legacy=trips.filter(t=>t.status==='received'&&!isExplicitReceipt(t));
 const loaded=trips.reduce((sum,t)=>sum+(positive(t.volume)?t.volume:0),0);
 return {
  totalTrips:trips.length,loadedM3:round(loaded),
  pendingTrips:pending.length,pendingM3:round(pending.reduce((s,t)=>s+(positive(t.volume)?t.volume:0),0)),
  disputedTrips:disputed.length,disputedLoadedM3:round(disputed.reduce((s,t)=>s+(positive(t.volume)?t.volume:0),0)),
  confirmedTrips:explicit.length,
  confirmedM3:round(explicit.reduce((s,t)=>s+(positive(t.receivedVolume)?t.receivedVolume:0),0)),
  legacyTrips:legacy.length,
  legacyM3:round(legacy.reduce((s,t)=>s+(positive(t.volume)?t.volume:0),0)),
  differentialsM3:round(explicit.reduce((s,t)=>s+(positive(t.discrepancyM3)?t.discrepancyM3:(Number.isFinite(t.discrepancyM3)?Number(t.discrepancyM3):0)),0))
 };
}
export function workOrderProgress(order:WorkOrder,trips:Trip[]){
 const related=trips.filter(t=>t.orderId===order.id);
 const result=receiptMetrics(related);
 return {...result,targetM3:order.targetVolume,
  progressPercent:order.targetVolume>0?Math.min(100,Math.max(0,round(result.confirmedM3/order.targetVolume*100))):0,
  remainingM3:Math.max(0,round(order.targetVolume-result.confirmedM3))};
}
export function completionError(order:WorkOrder,site:Site|undefined,trips:Trip[]):string|null {
 if(!site?.safetyReview)return 'الموقع يفتقر إلى مراجعة السلامة التجريبية';
 const relevant=trips.filter(t=>t.orderId===order.id);
 if(relevant.length===0)return 'لا توجد رحلات مرتبطة بالأمر';
 if(relevant.some(t=>t.status!=='received'||!isExplicitReceipt(t)))return 'توجد حمولات معلقة أو متنازع عليها أو سجلات استلام قديمة دون قياس منفصل';
 return null;
}
