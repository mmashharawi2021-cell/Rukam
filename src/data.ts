export type SiteStatus = 'needs_review' | 'verified' | 'planned' | 'active' | 'completed';
export type WorkStatus = 'draft' | 'approved' | 'active' | 'completed';
export type TripStatus = 'pending' | 'received' | 'disputed';
export type Site = {
  id: string; name: string; governorate: string; area: string;
  lat: number; lng: number; estimatedVolume: number; category: string;
  status: SiteStatus; safetyReview: boolean; note: string; createdAt: string;
};
export type WorkOrder = { id: string; siteId: string; contractor: string; targetVolume: number; status: WorkStatus; createdAt: string };
export type Trip = { id: string; orderId: string; vehicle: string; volume: number; facility: string; status: TripStatus; date: string };
export type Audit = { id: string; action: string; at: string };
export type DataStore = { sites: Site[]; orders: WorkOrder[]; trips: Trip[]; audit: Audit[] };
export const governorates = ['شمال غزة','غزة','الوسطى','خان يونس','رفح'];
export const statuses: Record<SiteStatus,{label:string; tone:string}> = {
  needs_review: { label:'بانتظار مراجعة السلامة',tone:'amber' },
  verified: {label:'تمت المراجعة',tone:'blue'},
  planned: {label:'ضمن خطة العمل',tone:'purple'},
  active: {label:'قيد المتابعة',tone:'cyan'},
  completed: {label:'مغلق',tone:'green'}
};
export const workStatuses: Record<WorkStatus,string> = {draft:'مسودة',approved:'معتمد إداريًا',active:'قيد المتابعة',completed:'مكتمل'};
export const tripStatuses: Record<TripStatus,{label:string;tone:string}> = {
  pending:{label:'بانتظار الاستلام',tone:'amber'},received:{label:'مستلمة',tone:'green'},disputed:{label:'تحتاج مطابقة',tone:'red'}
};
export const facilities = ['مرفق تجريبي A','مرفق تجريبي B','مرفق تجريبي C'];
const now='2026-11-01';
export const seed: DataStore = {
  sites: [
    {id:'RG-001',name:'قطاع تجريبي 01',governorate:'غزة',area:'المنطقة A',lat:31.507,lng:34.457,estimatedVolume:1260,category:'مختلط',status:'active',safetyReview:true,note:'بيانات توضيحية لا تصف موقعًا فعليًا',createdAt:now},
    {id:'RG-002',name:'قطاع تجريبي 02',governorate:'شمال غزة',area:'المنطقة B',lat:31.552,lng:34.475,estimatedVolume:840,category:'خرسانة',status:'planned',safetyReview:true,note:'تقدير تدريبي',createdAt:now},
    {id:'RG-003',name:'قطاع تجريبي 03',governorate:'الوسطى',area:'المنطقة C',lat:31.421,lng:34.381,estimatedVolume:2310,category:'مختلط',status:'needs_review',safetyReview:false,note:'لا يسمح بالاعتماد قبل مراجعة السلامة',createdAt:now},
    {id:'RG-004',name:'قطاع تجريبي 04',governorate:'خان يونس',area:'المنطقة D',lat:31.348,lng:34.303,estimatedVolume:1120,category:'مواد إنشائية',status:'verified',safetyReview:true,note:'جاهز للتخطيط الإداري التجريبي',createdAt:now},
    {id:'RG-005',name:'قطاع تجريبي 05',governorate:'رفح',area:'المنطقة E',lat:31.283,lng:34.251,estimatedVolume:760,category:'مختلط',status:'completed',safetyReview:true,note:'إغلاق تجريبي',createdAt:now},
    {id:'RG-006',name:'قطاع تجريبي 06',governorate:'غزة',area:'المنطقة F',lat:31.492,lng:34.429,estimatedVolume:590,category:'خرسانة',status:'needs_review',safetyReview:false,note:'قيد المراجعة',createdAt:now},
    {id:'RG-007',name:'قطاع تجريبي 07',governorate:'الوسطى',area:'المنطقة G',lat:31.398,lng:34.350,estimatedVolume:980,category:'مواد إنشائية',status:'planned',safetyReview:true,note:'ضمن خطة تجريبية',createdAt:now}
  ],
  orders: [
    {id:'WO-001',siteId:'RG-001',contractor:'فريق تجريبي 01',targetVolume:850,status:'active',createdAt:now},
    {id:'WO-002',siteId:'RG-002',contractor:'فريق تجريبي 02',targetVolume:600,status:'approved',createdAt:now},
    {id:'WO-003',siteId:'RG-005',contractor:'فريق تجريبي 01',targetVolume:500,status:'completed',createdAt:now},
    {id:'WO-004',siteId:'RG-007',contractor:'فريق تجريبي 03',targetVolume:420,status:'draft',createdAt:now}
  ],
  trips: [
    {id:'TR-001',orderId:'WO-001',vehicle:'TRK-01',volume:12,facility:'مرفق تجريبي A',status:'received',date:now},
    {id:'TR-002',orderId:'WO-001',vehicle:'TRK-02',volume:15,facility:'مرفق تجريبي B',status:'pending',date:now},
    {id:'TR-003',orderId:'WO-003',vehicle:'TRK-03',volume:10,facility:'مرفق تجريبي A',status:'received',date:now},
    {id:'TR-004',orderId:'WO-001',vehicle:'TRK-04',volume:11,facility:'مرفق تجريبي C',status:'disputed',date:now}
  ],
  audit:[{id:'A-001',action:'تهيئة بيانات العرض التجريبية',at:now}]
};
export const number = (n:number) => new Intl.NumberFormat('ar-PS',{maximumFractionDigits:1}).format(n||0);
export const csvSafe = (v:unknown) => { const s=String(v??''); const safe=/^[=+\-@\t\r]/.test(s)?"'"+s:s; return '"'+safe.replaceAll('"','""')+'"' };
export const uid = (prefix:string) => prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.floor(Math.random()*900+100);
