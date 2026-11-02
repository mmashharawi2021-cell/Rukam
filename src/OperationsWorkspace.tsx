import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ClipboardCheck, FileSpreadsheet,
 Factory, Plus, Scale, ShieldAlert, Truck, X } from 'lucide-react';
import type { DataStore, Trip } from './data';
import { isExplicitReceipt, receiptMetrics, receiptTolerance, workOrderProgress } from './operations';

type View='fleet'|'trips'|'reconciliation'|'reports';
type Props={
 view:View;db:DataStore;
 onDispatch:()=>void;
 onAddVehicle:(code:string,capacity:number,kind:string)=>boolean;
 onToggleVehicle:(code:string)=>void;
 onReceive:(trip:Trip,received:number,reference:string)=>boolean;
 onResolve:(trip:Trip,note:string)=>boolean;
 onExport:()=>void;
};
const fmt=(n:number)=>new Intl.NumberFormat('ar-PS',{maximumFractionDigits:2}).format(n);
const safeVolume=(v:number)=>Number.isFinite(v)?fmt(v):'—';
function Stat({label,value,hint}:{label:string;value:string;hint:string}){
 return <div className="ops-stat"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}
const matchStatus=(trip:Trip)=>{
 if(trip.status==='pending')return {label:'بانتظار محضر استلام',tone:'badge-amber'};
 if(trip.status==='disputed')return {label:'فرق في الكمية — يتطلب تسوية',tone:'badge-red'};
 return isExplicitReceipt(trip)
  ?{label:trip.reconciledAt?'مستلمة بعد تسوية تجريبية':'استلام مطابق تجريبي',tone:'badge-green'}
  :{label:'سجل قديم — بدون محضر قياس',tone:'badge-purple'};
};
export default function OperationsWorkspace({view,db,onDispatch,onAddVehicle,onToggleVehicle,onReceive,onResolve,onExport}:Props){
 const vehicles=db.vehicles||[];
 const metrics=useMemo(()=>receiptMetrics(db.trips),[db.trips]);
 const [vehicleCode,setVehicleCode]=useState('');
 const [vehicleCapacity,setVehicleCapacity]=useState('25');
 const [vehicleKind,setVehicleKind]=useState('شاحنة تجريبية');
 const [tripId,setTripId]=useState<string|null>(null);
 const [resolveId,setResolveId]=useState<string|null>(null);
 const [receivedInput,setReceivedInput]=useState('');
 const [receiptRef,setReceiptRef]=useState('');
 const [resolutionNote,setResolutionNote]=useState('');
 const [search,setSearch]=useState('');
 const [onlyUnresolved,setOnlyUnresolved]=useState(false);
 const activeTrip=db.trips.find(x=>x.id===tripId);
 const disputeTrip=db.trips.find(x=>x.id===resolveId);
 const filtered=db.trips.filter(t=>(!onlyUnresolved||t.status==='pending'||t.status==='disputed')&&
    [t.id,t.vehicle,t.orderId,t.facility,t.receiptRef||''].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const openReceipt=(trip:Trip)=>{setTripId(trip.id);setReceivedInput(String(trip.volume));setReceiptRef('');};
 const openResolve=(trip:Trip)=>{setResolveId(trip.id);setResolutionNote('');};
 const addVehicle=(e:React.FormEvent)=>{
  e.preventDefault();if(onAddVehicle(vehicleCode,Number(vehicleCapacity),vehicleKind)){setVehicleCode('');setVehicleCapacity('25');}
 };
 const ledger=<div className="ops-stat-grid" aria-label="مؤشرات النقل والمطابقة">
   <Stat label="كمية التحميل المسجلة" value={fmt(metrics.loadedM3)+' م³'} hint="إجمالي الرحلات — ليست كمية مستلمة"/>
   <Stat label="استلام بكمية موثقة محليًا" value={fmt(metrics.confirmedM3)+' م³'} hint={fmt(metrics.confirmedTrips)+' محضر تجريبي قابل للمراجعة'}/>
   <Stat label="بانتظار الاستلام" value={fmt(metrics.pendingTrips)+' رحلة'} hint={fmt(metrics.pendingM3)+' م³ محمّلة'/>
   <Stat label="فروقات معلقة" value={fmt(metrics.disputedTrips)+' رحلة'} hint={fmt(metrics.disputedLoadedM3)+' م³ قيد المطابقة'/>
   <Stat label="سجلات قديمة" value={fmt(metrics.legacyTrips)+' رحلة'} hint={fmt(metrics.legacyM3)+' م³ غير موثقة بقياس مستقل'/>
 </div>;
 if(view==='fleet')return <div className="ops-stack">
  <div className="ops-banner"><Truck size={22}/><div><b>سجل أسطول النقل التجريبي</b><p>أرقام المركبات وسعاتها بيانات تدريبية وليست تتبعًا مباشرًا أو تصريح تشغيل.</p></div></div>
  <section className="panel ops-pad">
   <h3>إضافة مركبة جديدة</h3>
   <form className="ops-fleet-form" onSubmit={addVehicle}>
    <label>رمز المركبة<input required maxLength={32} value={vehicleCode} onChange={e=>setVehicleCode(e.target.value.toUpperCase())} placeholder="TRK-05" /></label>
    <label>السعة بالـ م³<input type="number" required min=".01" max="1000" step=".01" value={vehicleCapacity} onChange={e=>setVehicleCapacity(e.target.value)}/></label>
    <label>النوع / الوصف<input maxLength={60} value={vehicleKind} onChange={e=>setVehicleKind(e.target.value)} placeholder="شاحنة تجريبية"/></label>
    <button className="btn btn-primary" type="submit"><Plus size={16}/> إضافة مركبة</button>
   </form>
  </section>
  <section className="panel">
   <div className="card-title"><div><h3>المركبات المسجلة</h3><p>لا يمكن جدولة حمولة جديدة لمركبة موقوفة أو مشغولة بحمولة معلقة</p></div><span className="badge badge-green">{fmt(vehicles.filter(v=>v.active).length)} نشطة</span></div>
   <div className="table-scroll"><table><thead><tr><th>المركبة</th><th>الوصف</th><th>السعة</th><th>الرحلات</th><th>الحمولات المعلقة</th><th>الحالة</th><th>إجراء</th></tr></thead>
    <tbody>{vehicles.map(v=>{const trips=db.trips.filter(t=>t.vehicle.toUpperCase()===v.code);
     return <tr key={v.code}><td className="mono">{v.code}</td><td>{v.kind||'غير محدد'}</td><td>{fmt(v.capacityM3)} م³</td><td>{fmt(trips.length)}</td><td>{fmt(trips.filter(t=>t.status==='pending').length)}</td>
      <td><span className={'badge '+(v.active?'badge-green':'badge-amber')}>{v.active?'متاحة':'موقوفة'}</span></td>
      <td><button className="small-button" onClick={()=>onToggleVehicle(v.code)}>{v.active?'إيقاف تجريبي':'إعادة إتاحة'}</button></td></tr>;
    })}</tbody></table></div>
  </section>
 </div>;
 return <div className="ops-stack">
  <div className="ops-banner"><Scale size={22}/><div><b>دفتر الكميات وحركة الركام</b><p>نفصل بين الكمية المقدرة بالموقع والكمية المحمّلة والكمية التي سُجل استلامها بمحضر. كل ما يلي تجريبي.</p></div></div>
  {ledger}
  {view==='reports'||view==='reconciliation'?<section className="panel">
    <div className="card-title"><div><h3>مطابقة أوامر العمل</h3><p>نسبة الإنجاز تعتمد على الاستلام المسجل بمحضر وكمية مستقلة فقط</p></div><button onClick={onExport} className="small-button"><FileSpreadsheet size={16}/> تصدير سجل العمليات CSV</button></div>
    <div className="table-scroll"><table><thead><tr><th>الأمر</th><th>الموقع</th><th>المستهدف</th><th>المحمّل</th><th>المستلم بمحضر</th><th>سجلات قديمة</th><th>معلّقة</th><th>نسبة الاستلام</th></tr></thead>
     <tbody>{db.orders.map(o=>{const p=workOrderProgress(o,db.trips);return <tr key={o.id}>
       <td className="mono">{o.id}</td><td>{db.sites.find(s=>s.id===o.siteId)?.name||'غير معروف'}</td>
       <td>{fmt(o.targetVolume)} م³</td><td>{fmt(p.loadedM3)} م³</td><td>{fmt(p.confirmedM3)} م³</td>
       <td>{fmt(p.legacyM3)} م³</td><td>{fmt(p.pendingTrips+p.disputedTrips)} رحلة</td><td><div className="ops-progress"><span style={{width:p.progressPercent+'%'}}/></div><small>{fmt(p.progressPercent)}%</small></td>
     </tr>})}</tbody>
    </table></div>
  </section>:null}
  {view==='reports'||view==='reconciliation'?<section className="panel">
    <div className="card-title"><div><h3>أرصدة مرافق الاستلام</h3><p>المطابقة حسب سجلات الرحلات؛ لا تتضمن موازين أو أجهزة تتبع فعلية</p></div><Factory size={19}/></div>
    <div className="table-scroll"><table><thead><tr><th>المرفق</th><th>إجمالي المحمّل</th><th>كمية الاستلام المسجلة</th><th>فروقات معلقة</th><th>سجلات مستلمة قديمة</th></tr></thead><tbody>
    {Array.from(new Set(db.trips.map(t=>t.facility))).map(name=>{const m=receiptMetrics(db.trips.filter(t=>t.facility===name));return <tr key={name}><td>{name}</td><td>{fmt(m.loadedM3)} م³</td><td>{fmt(m.confirmedM3)} م³</td><td>{fmt(m.disputedTrips)} رحلة</td><td>{fmt(m.legacyM3)} م³</td></tr>})}
    </tbody></table></div>
  </section>:null}
  {view!=='reports'&&<section className="panel">
    <div className="card-title"><div><h3>{view==='trips'?'سجل الرحلات والحمولات':'الاستلام والفروقات'}</h3><p>الرحلات المعلقة لا تُحسب ضمن الاستلام ولا يمكن إغلاقها تلقائيًا</p></div>
      <div className="ops-head-actions"><button type="button" onClick={()=>setOnlyUnresolved(v=>!v)} className="small-button">{onlyUnresolved?'عرض جميع الرحلات':'المعلّقة فقط'}</button>{view==='trips'&&<button className="btn btn-primary" onClick={onDispatch}><Plus size={16}/> تسجيل حمولة</button>}</div>
    </div>
    <div className="ops-search"><input value={search} onChange={e=>setSearch(e.target.value)} aria-label="البحث في سجلات الرحلات" placeholder="بحث برقم الرحلة أو المركبة أو الأمر أو المحضر"/></div>
    <div className="table-scroll"><table><thead><tr><th>الرحلة</th><th>أمر العمل</th><th>المركبة</th><th>المرفق</th><th>المحمّل (م³)</th><th>المستلم (م³)</th><th>الفرق (م³)</th><th>حالة المطابقة</th><th>إجراء</th></tr></thead>
    <tbody>{filtered.map(t=>{const status=matchStatus(t);return <tr key={t.id}>
      <td className="mono">{t.id}<small>{t.date}</small></td><td className="mono">{t.orderId}</td><td className="mono">{t.vehicle}</td><td>{t.facility}</td>
      <td>{fmt(t.volume)}</td><td>{Number.isFinite(t.receivedVolume)?fmt(Number(t.receivedVolume)):'—'}</td>
      <td>{Number.isFinite(t.discrepancyM3)?fmt(Number(t.discrepancyM3)):'—'}</td>
      <td><span className={'badge '+status.tone}>{status.label}</span>{t.receiptRef&&<small>محضر: {t.receiptRef}</small>}</td>
      <td>{t.status==='pending'?<button type="button" className="small-button" onClick={()=>openReceipt(t)}><ClipboardCheck size={15}/> تسجيل الاستلام</button>:
       t.status==='disputed'?<button type="button" className="small-button" onClick={()=>openResolve(t)}><ArrowLeftRight size={15}/> تسوية الفرق</button>:
       t.reconciliationNote?<span className="ops-note" title={t.reconciliationNote}>مراجعة موثقة محليًا</span>:<span className="ops-note">{isExplicitReceipt(t)?'مطابق':'بيانات قديمة'}</span>}</td>
     </tr>})}</tbody></table>
    {!filtered.length&&<p className="ops-empty">لا توجد رحلات مطابقة للبحث</p>}</div>
  </section>}
  {activeTrip&&<div className="dialog-shade" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setTripId(null)}}>
    <div className="modal ops-dialog" role="dialog" aria-modal="true" aria-label="تسجيل محضر الاستلام التجريبي">
      <div className="modal-head"><div><h2>محضر استلام تجريبي</h2><p>الحمولة {activeTrip.id} · الكمية المحمّلة {fmt(activeTrip.volume)} م³</p></div><button className="icon-button" onClick={()=>setTripId(null)} aria-label="إغلاق"><X size={18}/></button></div>
      <form onSubmit={e=>{e.preventDefault();if(onReceive(activeTrip,Number(receivedInput),receiptRef))setTripId(null)}}>
        <div className="modal-body ops-dialog-fields">
          <label>كمية الاستلام المقاسة (م³)<input required type="number" min=".01" max="1000000" step=".01" value={receivedInput} onChange={e=>setReceivedInput(e.target.value)}/></label>
          <label>رقم محضر الاستلام التجريبي<input required minLength={3} maxLength={60} value={receiptRef} onChange={e=>setReceiptRef(e.target.value)} placeholder="REC-DEMO-001"/></label>
          <p className="ops-hint"><AlertTriangle size={16}/> حد الاختلاف المقبول للعرض هو الأكبر بين {fmt(receiptTolerance(activeTrip.volume))} م³ و5% من الحمولة. تجاوز الحد ينشئ حالة «تحتاج تسوية» بدل اعتبارها مطابقة.</p>
          <p className="ops-hint">هذا النموذج يسجل رقم محضر نصيًا فقط، ولا يتحقق من مستند أو توقيع رسمي.</p>
        </div><div className="modal-footer"><button type="button" className="btn btn-outline" onClick={()=>setTripId(null)}>إلغاء</button><button type="submit" className="btn btn-primary"><CheckCircle2 size={16}/> حفظ الاستلام التجريبي</button></div>
      </form>
    </div>
  </div>}
  {disputeTrip&&<div className="dialog-shade" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setResolveId(null)}}>
    <div className="modal ops-dialog" role="dialog" aria-modal="true" aria-label="تسوية فرق الحمولة">
      <div className="modal-head"><div><h2>تسوية فرق كمية — تجريبي</h2><p>{disputeTrip.id} · محضر {disputeTrip.receiptRef||'غير متاح'}</p></div><button className="icon-button" onClick={()=>setResolveId(null)} aria-label="إغلاق"><X size={18}/></button></div>
      <form onSubmit={e=>{e.preventDefault();if(onResolve(disputeTrip,resolutionNote))setResolveId(null)}}>
        <div className="modal-body ops-dialog-fields">
          <div className="ops-compare"><div>التحميل <b>{fmt(disputeTrip.volume)} م³</b></div><div>الاستلام <b>{safeVolume(Number(disputeTrip.receivedVolume))} م³</b></div></div>
          <label>تفسير الفرق ومراجعة السجل<textarea required minLength={12} rows={4} value={resolutionNote} onChange={e=>setResolutionNote(e.target.value)} placeholder="وضح سبب الفرق ومن راجع السجل تجريبيًا دون إدراج بيانات شخصية"/></label>
          <p className="ops-hint"><ShieldAlert size={16}/> التسوية هنا محاكاة محلية ولا تعني تصريحًا ماليًا أو اعتمادًا هندسيًا.</p>
        </div><div className="modal-footer"><button type="button" className="btn btn-outline" onClick={()=>setResolveId(null)}>إلغاء</button><button type="submit" className="btn btn-primary"><CheckCircle2 size={16}/> تسوية تجريبية</button></div>
      </form>
    </div>
  </div>}
 </div>;
}
