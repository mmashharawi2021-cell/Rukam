import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import SurveyWorkspace, { type SurveySubmission } from './SurveyWorkspace';
import OperationsWorkspace from './OperationsWorkspace';
import { normalizeFleet, receiptMetrics, dispatchError, receiptError, applyReceipt,
  resolveDispute, completionError, workOrderProgress, isExplicitReceipt } from './operations';
import { representativePoint, validSurveyGeometry } from './surveyMath';
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, Bell,
  Building2, CheckCircle2, ChevronDown, ChevronLeft, CircleHelp, ClipboardCheck,
  ClipboardList, Clock3, CloudOff, Database, Download, Factory, FileBarChart2, FileJson,
  FileSpreadsheet, Filter, FolderOpen, LayoutDashboard, Layers3, MapPin, Menu, MoreHorizontal,
  Plus, RotateCcw, Search, Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal,
  Trash2, Truck, UploadCloud, Waypoints, X
} from 'lucide-react';
import {
  type Audit, type DataStore, type Site, type SiteStatus, type WorkOrder, type WorkStatus,
  type Trip, type TripStatus, type FleetVehicle, seed, statuses, workStatuses, tripStatuses, governorates,
  facilities, number, csvSafe, uid
} from './data';

const KEY = 'rukamgis-v01-demo-local-state';
const asDate = () => new Date().toLocaleDateString('en-CA');
const fmt = (n:number) => number(n);
const when = () => new Date().toLocaleString('ar-PS', { dateStyle:'medium', timeStyle:'short' });
const copySeed = ():DataStore => JSON.parse(JSON.stringify(seed));
function loadStore():DataStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return copySeed();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.sites) && Array.isArray(parsed.orders) && Array.isArray(parsed.trips) && Array.isArray(parsed.audit))
      return {...parsed,vehicles:normalizeFleet(parsed.vehicles,parsed.trips)};
  } catch { /* use safe demo seed */ }
  return copySeed();
}
function download(text:string, filename:string, mime:string) {
  const url = URL.createObjectURL(new Blob(['\ufeff',text],{type:mime}));
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),4000);
}
const colorFor = (status:SiteStatus) => ({ needs_review:'#C18A39',verified:'#4F7DA7',planned:'#9876A5',active:'#5FA9A6',completed:'#6B8F67' }[status]);
const statusBadge = (status:SiteStatus) => <span className={'badge badge-'+statuses[status].tone}><span className="badge-dot"/>{statuses[status].label}</span>;
function MapView({sites,onPick,selectedId,large=false}:{sites:Site[];onPick:(id:string)=>void;selectedId?:string|null;large?:boolean}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map|null>(null);
  const layer = useRef<L.LayerGroup|null>(null);
  const action = useRef(onPick);
  action.current = onPick;
  useEffect(()=>{
    if (!node.current || map.current) return;
    const instance = L.map(node.current,{center:[31.42,34.37],zoom:10,zoomControl:false,scrollWheelZoom:false,attributionControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',maxZoom:18
    }).addTo(instance);
    L.control.zoom({position:'bottomleft'}).addTo(instance);
    map.current=instance;
    layer.current=L.layerGroup().addTo(instance);
    window.setTimeout(()=>instance.invalidateSize(),120);
    return ()=>{instance.remove();map.current=null;layer.current=null;};
  },[]);
  useEffect(()=>{
    const group=layer.current;if(!group)return;
    group.clearLayers();
    for(const site of sites) {
      if (!Number.isFinite(site.lat)||!Number.isFinite(site.lng)) continue;
      const c=colorFor(site.status);
      if(validSurveyGeometry(site.geometry)&&site.geometry.type==='Polygon'){
        const coords=site.geometry.coordinates[0].map(([lng,lat])=>[lat,lng] as L.LatLngTuple);
        L.polygon(coords,{color:c,weight:2,fillColor:c,fillOpacity:.22,interactive:false}).addTo(group);
      }
      L.circleMarker([site.lat,site.lng],{
        radius:site.id===selectedId?12:9,color:'#ffffff',weight:site.id===selectedId?3:2,
        fillColor:c,fillOpacity:0.94
      }).addTo(group).bindTooltip(site.name,{direction:'top',offset:[0,-11]}).on('click',()=>action.current(site.id));
    }
  },[sites,selectedId]);
  useEffect(()=>{const s=sites.find(x=>x.id===selectedId);if(s&&map.current)map.current.flyTo([s.lat,s.lng],Math.max(map.current.getZoom(),12),{duration:.45});},[selectedId]);
  return <div className={'map-view '+(large?'map-large':'')}>
    <div className="map-leaflet" ref={node}/>
    <div className="map-top-info"><span className="live-indicator"/> خريطة تفاعلية <b>·</b> بيانات تدريبية</div>
    <div className="map-legend"><span><i style={{background:'#C18A39'}}/>مراجعة</span><span><i style={{background:'#5FA9A6'}}/>متابعة</span><span><i style={{background:'#6B8F67'}}/>مغلق</span></div>
  </div>;
}

const nav = [
  {id:'dashboard',label:'نظرة عامة',icon:LayoutDashboard},
  {id:'sites',label:'خريطة ومواقع الركام',icon:MapPin},
  {id:'survey',label:'الحصر والرسم الجغرافي',icon:Layers3},
  {id:'orders',label:'أوامر العمل',icon:ClipboardList},
  {id:'trips',label:'النقل والحمولات',icon:Truck},
  {id:'fleet',label:'أسطول المركبات',icon:Truck},
  {id:'reconciliation',label:'مطابقة الكميات',icon:ClipboardCheck},
  {id:'facilities',label:'مرافق الاستلام',icon:Factory},
  {id:'reports',label:'المؤشرات والتقارير',icon:FileBarChart2},
  {id:'settings',label:'الإعدادات والبيانات',icon:Settings2}
] as const;
type Page = typeof nav[number]['id'];
type Dialog = 'site'|'order'|'trip'|null;
const pageMeta:Record<Page,{title:string;lead:string}>={
  dashboard:{title:'نظرة عامة',lead:'ملخص عمليات إدارة الركام الجغرافية'},
  sites:{title:'خريطة ومواقع الركام',lead:'إدارة سجلات المواقع وخصائصها ومراجعات السلامة'},
  survey:{title:'الحصر والرسم الجغرافي',lead:'رسم المواقع وقياس مساحاتها وتقدير كميات الركام مع عدم اليقين'},
  orders:{title:'أوامر العمل',lead:'متابعة أوامر العمل التجريبية وربطها بالمواقع المعتمدة'},
  trips:{title:'النقل والحمولات',lead:'إدارة تحميل الركام والاستلام بقياس منفصل ومحضر تجريبي'},
  fleet:{title:'أسطول المركبات',lead:'تعريف المركبات والسعات وحالات الإتاحة التجريبية'},
  reconciliation:{title:'مطابقة الكميات',lead:'فروقات التحميل والاستلام والتسوية والتقارير حسب الأمر والمرفق'},
  facilities:{title:'مرافق الاستلام',lead:'أرصدة الاستلام وفق السجلات التجريبية المرتبطة'},
  reports:{title:'المؤشرات والتقارير',lead:'تقارير تفصيلية قابلة للتصدير والبحث'},
  settings:{title:'الإعدادات والبيانات',lead:'إدارة البيانات المحلية ونسخ المشروع الاحتياطية'}
};
function Empty({title,detail}:{title:string;detail:string}){return <div className="empty"><FolderOpen size={28}/><strong>{title}</strong><span>{detail}</span></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
function CardTitle({title,sub,action}:{title:string;sub?:string;action?:React.ReactNode}){return <div className="card-title"><div><h3>{title}</h3>{sub&&<p>{sub}</p>}</div>{action}</div>}

export default function App(){
  const [db,setDb]=useState<DataStore>(loadStore);
  const [page,setPage]=useState<Page>('dashboard');
  const [selected,setSelected]=useState<string|null>(null);
  const [dialog,setDialog]=useState<Dialog>(null);
  const [sidebar,setSidebar]=useState(false);
  const [query,setQuery]=useState('');
  const [governorate,setGovernorate]=useState('الكل');
  const [siteStatus,setSiteStatus]=useState('الكل');
  const [toast,setToast]=useState('');
  const [showDemo,setShowDemo]=useState(true);
  const fileRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(db));}catch{ /* storage unavailable */ }},[db]);
  useEffect(()=>{if(!toast)return;const t=window.setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t)},[toast]);
  const tell=(message:string)=>setToast(message);
  const log=(action:string)=>({id:uid('AUD'),action,at:when()});
  const changePage=(p:Page)=>{setPage(p);setSidebar(false);setQuery('');setGovernorate('الكل');setSiteStatus('الكل');};
  const filtered=useMemo(()=>db.sites.filter(s=>(governorate==='الكل'||s.governorate===governorate)&&(siteStatus==='الكل'||s.status===siteStatus)&&[s.name,s.id,s.area,s.governorate].join(' ').toLowerCase().includes(query.toLowerCase().trim())),[db.sites,governorate,siteStatus,query]);
  const selectedSite=db.sites.find(s=>s.id===selected)||null;
  const reviewed=db.sites.filter(s=>s.safetyReview).length;
  const unreviewed=db.sites.length-reviewed;
  const totalEstimate=db.sites.reduce((a,s)=>a+(Number(s.estimatedVolume)||0),0);
  const operations=receiptMetrics(db.trips);
  const received=operations.confirmedM3;
  const inTransit=operations.pendingM3;
  const activeOrders=db.orders.filter(o=>o.status==='approved'||o.status==='active').length;
  const totalByGov=governorates.map(g=>({g,count:db.sites.filter(s=>s.governorate===g).length,vol:db.sites.filter(s=>s.governorate===g).reduce((a,s)=>a+Number(s.estimatedVolume||0),0)}));
  const orderLabel=(id:string)=>db.orders.find(o=>o.id===id)?.id||id;
  const orderSite=(id:string)=>{const o=db.orders.find(o=>o.id===id);return db.sites.find(s=>s.id===o?.siteId)?.name||'غير معروف';};
  const saveSite=(f:FormData)=>{
    const title=String(f.get('name')||'').trim();const area=String(f.get('area')||'').trim();
    const lat=Number(f.get('lat'));const lng=Number(f.get('lng'));const volume=Number(f.get('estimatedVolume'));
    if(title.length<3||!area||!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lng)||lng<-180||lng>180||!Number.isFinite(volume)||volume<0){tell('يرجى مراجعة بيانات الموقع والإحداثيات والكمية');return false;}
    const site:Site={id:uid('RG'),name:title,area,governorate:String(f.get('governorate')),lat,lng,estimatedVolume:volume,category:String(f.get('category')),status:'needs_review',safetyReview:false,note:String(f.get('note')||''),createdAt:asDate()};
    setDb(d=>({...d,sites:[site,...d.sites],audit:[log('إضافة موقع توضيحي '+site.id),...d.audit]}));setSelected(site.id);setDialog(null);tell('تمت إضافة الموقع التجريبي');return true;
  };
  const saveSurvey=(record:SurveySubmission)=>{
    const [lng,lat]=representativePoint(record.geometry);
    const site:Site={
      id:uid('RG'),name:record.name,area:record.area,governorate:record.governorate,
      lat,lng,estimatedVolume:record.estimate.volumeM3,category:record.category,
      status:'needs_review',safetyReview:false,note:record.note,createdAt:asDate(),
      geometry:record.geometry,
      survey:{...record.estimate,riskFlags:record.risks,recordedAt:new Date().toISOString()}
    };
    setDb(d=>({...d,sites:[site,...d.sites],
      audit:[log('إضافة حصر GIS تجريبي '+site.id+' بكمية '+site.estimatedVolume+' م³'),...d.audit]}));
    setSelected(site.id);
    tell('تم تسجيل الحصر كمسودة غير معتمدة');
  };
  const updateSite=(id:string,next:SiteStatus)=>{
    const s=db.sites.find(x=>x.id===id);if(!s)return;
    if(next!=='needs_review'&&!s.safetyReview){tell('لا يمكن تغيير الحالة قبل مراجعة السلامة بواسطة جهة مختصة');return;}
    setDb(d=>({...d,sites:d.sites.map(x=>x.id===id?{...x,status:next}:x),audit:[log('تحديث حالة '+id+' إلى '+statuses[next].label),...d.audit]}));tell('تم تحديث الحالة في النسخة التجريبية');
  };
  const markReviewed=(id:string)=>{
    if(!window.confirm('هذا إجراء توضيحي وليس موافقة سلامة حقيقية. هل تريد محاكاة اعتماد مراجعة السلامة لهذا السجل؟'))return;
    setDb(d=>({...d,sites:d.sites.map(x=>x.id===id?{...x,safetyReview:true,status:x.status==='needs_review'?'verified':x.status}:x),audit:[log('محاكاة توثيق مراجعة السلامة '+id),...d.audit]}));tell('تم توثيق المراجعة التجريبية');
  };
  const deleteSite=(id:string)=>{
    if(db.orders.some(o=>o.siteId===id)){tell('لا يمكن حذف موقع مرتبط بأوامر عمل');return;}
    if(!window.confirm('هل تريد حذف هذا الموقع التجريبي؟'))return;
    setDb(d=>({...d,sites:d.sites.filter(s=>s.id!==id),audit:[log('حذف موقع '+id),...d.audit]}));if(selected===id)setSelected(null);tell('تم حذف السجل');
  };
  const saveOrder=(f:FormData)=>{
    const siteId=String(f.get('siteId'));const s=db.sites.find(x=>x.id===siteId);const contractor=String(f.get('contractor')||'').trim();const volume=Number(f.get('targetVolume'));
    if(!s||!s.safetyReview||!contractor||!Number.isFinite(volume)||volume<=0){tell('اختر موقعًا تمت مراجعته واملأ بيانات الأمر');return false;}
    const o:WorkOrder={id:uid('WO'),siteId,contractor,targetVolume:volume,status:'draft',createdAt:asDate()};
    setDb(d=>({...d,orders:[o,...d.orders],audit:[log('إنشاء أمر عمل تجريبي '+o.id),...d.audit]}));setDialog(null);tell('تم إنشاء أمر العمل');return true;
  };
  const changeOrder=(o:WorkOrder,status:WorkStatus)=>{
    const s=db.sites.find(x=>x.id===o.siteId);
    if(status!=='draft'&&!s?.safetyReview){tell('يتطلب التقدم في أمر العمل توثيق مراجعة السلامة');return;}
    if(status==='completed'){const issue=completionError(o,s,db.trips);if(issue){tell(issue);return;}}
    setDb(d=>({...d,orders:d.orders.map(x=>x.id===o.id?{...x,status}:x),audit:[log('تحديث أمر عمل '+o.id+' إلى '+workStatuses[status]),...d.audit]}));tell('تم تحديث أمر العمل');
  };
  const saveVehicle=(rawCode:string,capacityM3:number,kind:string)=>{
    const code=rawCode.trim().toUpperCase();
    if(!/^[A-Z0-9_-]{3,32}$/.test(code)||!Number.isFinite(capacityM3)||capacityM3<=0||capacityM3>1000){
      tell('رمز المركبة يجب أن يتكون من حروف إنجليزية وأرقام، والسعة بين 0 و1000 م³');return false;
    }
    if((db.vehicles||[]).some(v=>v.code===code)){tell('رمز المركبة مسجل بالفعل');return false;}
    const vehicle:FleetVehicle={code,capacityM3,active:true,kind:kind.trim().slice(0,60)};
    setDb(d=>({...d,vehicles:[...(d.vehicles||[]),vehicle],audit:[log('تسجيل مركبة تجريبية '+code),...d.audit]}));
    tell('تمت إضافة المركبة التجريبية');return true;
  };
  const toggleVehicle=(code:string)=>{
    setDb(d=>({...d,vehicles:d.vehicles.map(v=>v.code===code?{...v,active:!v.active}:v),
      audit:[log('تغيير إتاحة المركبة '+code),...d.audit]}));tell('تم تحديث حالة المركبة');
  };
  const saveTrip=(f:FormData)=>{
    const orderId=String(f.get('orderId'));const o=db.orders.find(x=>x.id===orderId);
    const vehicleCode=String(f.get('vehicle')).trim().toUpperCase();
    const vehicle=db.vehicles.find(v=>v.code===vehicleCode);
    const volume=Number(f.get('volume'));
    const site=db.sites.find(s=>s.id===o?.siteId);
    const issue=dispatchError(o,site,vehicle,volume,db.trips);
    if(issue){tell(issue);return false;}
    const facility=String(f.get('facility')||'');
    if(!facilities.includes(facility)){tell('مرفق الاستلام غير معروف');return false;}
    const t:Trip={id:uid('TR'),orderId,vehicle:vehicleCode,volume,facility,status:'pending',date:asDate()};
    setDb(d=>({...d,trips:[t,...d.trips],audit:[log('تحميل تجريبي '+t.id+' '+volume+' م³ في '+vehicleCode),...d.audit]}));
    setDialog(null);tell('سجلنا الحمولة بانتظار استلام منفصل');return true;
  };
  const receiveTrip=(t:Trip,quantity:number,ref:string)=>{
    const current=db.trips.find(x=>x.id===t.id);if(!current){tell('الحمولة غير موجودة');return false;}
    const issue=receiptError(current,quantity,ref,db.trips);if(issue){tell(issue);return false;}
    if(!window.confirm('محاكاة تسجيل محضر استلام محلي؟ لا يمثل ذلك توقيعًا أو إثباتًا رسميًا.'))return false;
    const updated=applyReceipt(current,quantity,ref,new Date().toISOString());
    setDb(d=>({...d,trips:d.trips.map(x=>x.id===current.id?updated:x),
      audit:[log('تسجيل قياس استلام '+current.id+' '+quantity+' م³: '+(updated.status==='disputed'?'فرق للمطابقة':'مطابق تجريبيًا')),...d.audit]}));
    tell(updated.status==='disputed'?'تم تسجيل فرق يستلزم تسوية تجريبية':'تم تسجيل استلام مطابق تجريبيًا');return true;
  };
  const settleTrip=(t:Trip,note:string)=>{
    const current=db.trips.find(x=>x.id===t.id);if(!current){tell('الحمولة غير موجودة');return false;}
    if(!window.confirm('تسجيل تسوية افتراضية لهذا الفرق؟ لا تمثل موافقة مالية أو فنية معتمدة.'))return false;
    try{
      const updated=resolveDispute(current,note,new Date().toISOString());
      setDb(d=>({...d,trips:d.trips.map(x=>x.id===current.id?updated:x),
        audit:[log('تسوية فرق تجريبية '+current.id+'؛ السبب: '+note.trim().slice(0,120)),...d.audit]}));
      tell('تم توثيق التسوية التجريبية دون تعديل كمية التحميل الأصلية');return true;
    }catch(e){tell(e instanceof Error?e.message:'تعذر توثيق التسوية');return false;}
  };
  const exportOperationsCsv=()=>{
    const rows=[['Trip','Order','Vehicle','Facility','Loaded m3','Received m3','Difference m3','Status','Receipt reference','Resolution note'],
      ...db.trips.map(t=>[t.id,t.orderId,t.vehicle,t.facility,t.volume,t.receivedVolume??'',t.discrepancyM3??'',
        t.status,isExplicitReceipt(t)?t.receiptRef:'',t.reconciliationNote??''])];
    download(rows.map(row=>row.map(csvSafe).join(',')).join('\r\n'),'rukamgis-v03-operations.csv','text/csv;charset=utf-8');
    tell('تم تصدير سجل العمليات التجريبي');
  };
  const geoExport=()=>{
    const features=db.sites.map(s=>({type:'Feature',geometry:validSurveyGeometry(s.geometry)?s.geometry:{type:'Point',coordinates:[s.lng,s.lat]},properties:{id:s.id,name:s.name,governorate:s.governorate,estimatedVolume:s.estimatedVolume,category:s.category,status:s.status,reviewed:s.safetyReview,demo:true}}));
    download(JSON.stringify({type:'FeatureCollection',features},null,2),'rukamgis-demo-sites.geojson','application/geo+json;charset=utf-8');tell('تم تنزيل GeoJSON');
  };
  const csvExport=()=>{
    const rows=[['ID','Name','Governorate','Area','Latitude','Longitude','Estimate m3','Status','Review'],...db.sites.map(s=>[s.id,s.name,s.governorate,s.area,s.lat,s.lng,s.estimatedVolume,s.status,s.safetyReview])];
    download(rows.map(r=>r.map(csvSafe).join(',')).join('\r\n'),'rukamgis-demo-sites.csv','text/csv;charset=utf-8');tell('تم تنزيل ملف CSV');
  };
  const exportBackup=()=>{download(JSON.stringify({schema:'rukamgis-demo-v0.1',exportedAt:new Date().toISOString(),data:db},null,2),'rukamgis-demo-backup.json','application/json;charset=utf-8');tell('تم تنزيل النسخة الاحتياطية')};
  const importBackup=async(file?:File)=>{
    if(!file)return;
    try{
      if(file.size>2*1024*1024)throw new Error('حجم الملف أكبر من 2 ميجابايت');
      const p=JSON.parse(await file.text());const d=p.data;
      if(p.schema!=='rukamgis-demo-v0.1'||!d||!Array.isArray(d.sites)||!Array.isArray(d.orders)||!Array.isArray(d.trips)||!Array.isArray(d.audit))throw new Error('صيغة النسخة غير معتمدة');
      if(d.sites.length>10000||d.orders.length>10000||d.trips.length>20000)throw new Error('الملف كبير جدًا');
      if(!d.sites.every((s:any)=>typeof s.id==='string'&&typeof s.name==='string'&&Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&Number.isFinite(s.estimatedVolume)&&statuses[s.status as SiteStatus]) || !d.orders.every((o:any)=>typeof o.id==='string'&&typeof o.siteId==='string'&&workStatuses[o.status as WorkStatus]) || !d.trips.every((t:any)=>typeof t.id==='string'&&typeof t.orderId==='string'&&Number.isFinite(t.volume)&&tripStatuses[t.status as TripStatus]) || !d.audit.every((a:any)=>typeof a.action==='string'))throw new Error('بيانات غير صحيحة');
      if(!window.confirm('سيتم استبدال جميع البيانات التجريبية المخزنة في هذا المتصفح، هل توافق؟'))return;
      setDb({...d,vehicles:normalizeFleet(d.vehicles,d.trips)});setSelected(null);tell('تم استيراد النسخة التجريبية');
    }catch(e){tell('فشل الاستيراد: '+(e instanceof Error?e.message:'ملف غير صالح'));}
    finally{if(fileRef.current)fileRef.current.value='';}
  };
  const restore=()=>{if(!window.confirm('هل تريد إعادة البيانات التجريبية الأصلية وفقدان التعديلات المحلية؟'))return;setDb(copySeed());setSelected(null);tell('تمت استعادة بيانات العرض');};
  const openSite=(id:string)=>{setSelected(id);setPage('sites')};
  const reviewedOptions=db.sites.filter(x=>x.safetyReview);
  const activeOrderOptions=db.orders.filter(x=>['approved','active'].includes(x.status));

  return <div className="app-shell">
    {sidebar&&<button className="sidebar-backdrop" onClick={()=>setSidebar(false)} aria-label="إغلاق القائمة"/>}
    <aside className={'sidebar '+(sidebar?'sidebar-open':'')}>
      <div className="brand"><div className="brand-logo"><Layers3 size={25}/><span className="tiny-star"/></div><div><strong>Rukam<span>GIS</span></strong><small>DEBRIS INTELLIGENCE SYSTEM</small></div></div>
      <div className="sidebar-group-label">مساحة العمل</div>
      <nav aria-label="أقسام النظام" className="nav-list">{nav.map(({id,label,icon:Icon})=><button key={id} className={'nav-item '+(page===id?'active':'')} aria-current={page===id?'page':undefined} onClick={()=>changePage(id)}><Icon size={19}/><span>{label}</span>{page===id&&<span className="active-indicator"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-info"><div className="info-glow"/><ShieldCheck size={22}/><strong>نسخة العرض التجريبية</strong><span>البيانات محفوظة محليًا على جهازك ولا تمثل مواقع ركام حقيقية.</span></div><div className="sidebar-profile"><div className="avatar">RG</div><div><strong>مشرف العرض</strong><small>Demo Workspace</small></div><ChevronDown size={16}/></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="topbar-right"><button className="icon-button mobile-menu" onClick={()=>setSidebar(true)} aria-label="فتح القائمة"><Menu size={22}/></button><div className="breadcrumb"><span>RukamGIS</span><ChevronLeft size={16}/><b>{pageMeta[page].title}</b></div></div><div className="topbar-left"><span className="demo-state"><span className="pulse"/> وضع تجريبي</span><button className="icon-button top-help" onClick={()=>changePage('settings')} title="المساعدة والبيانات"><CircleHelp size={19}/></button><button className="top-avatar" onClick={()=>changePage('settings')}>RG</button></div></header>
      <main className="main-area">
        {showDemo&&<div className="demo-notice"><AlertTriangle size={19}/><span><b>بيئة تجريبية مستقلة:</b> البيانات والمواقع والكميات افتراضية. يمنع استخدامها لتوجيه أعمال إزالة فعلية أو اعتماد السلامة ميدانيًا.</span><button onClick={()=>setShowDemo(false)} aria-label="إغلاق التنبيه"><X size={17}/></button></div>}
        <div className="page-heading"><div><span className="eyebrow"><span/> RUKAMGIS / WORKSPACE</span><h1>{pageMeta[page].title}</h1><p>{pageMeta[page].lead}</p></div><div className="heading-actions">{page==='sites'?<button className="btn btn-primary" onClick={()=>setDialog('site')}><Plus size={17}/> إضافة موقع</button>:page==='orders'?<button className="btn btn-primary" onClick={()=>setDialog('order')}><Plus size={17}/> أمر عمل جديد</button>:page==='trips'?<button className="btn btn-primary" onClick={()=>setDialog('trip')}><Plus size={17}/> تسجيل حمولة</button>:page==='reports'?<button className="btn btn-primary" onClick={csvExport}><Download size={17}/> تصدير تقرير CSV</button>:<span className="current-date"><Clock3 size={16}/>{new Date().toLocaleDateString('ar-PS',{year:'numeric',month:'long',day:'numeric'})}</span>}</div></div>

        {page==='dashboard'&&<>
          <section className="kpi-grid" aria-label="مؤشرات الأداء">
            <Kpi title="المواقع المسجلة" value={fmt(db.sites.length)} suffix="موقع" desc="مواقع ضمن بيانات العرض" icon={MapPin} shade="teal" />
            <Kpi title="حجم الركام التقديري" value={fmt(totalEstimate)} suffix="م³" desc="تقديرات تدريبية غير معتمدة" icon={Layers3} shade="blue" />
            <Kpi title="الحمولات المستلمة" value={fmt(received)} suffix="م³" desc="محاضر استلام بقياس منفصل في هذه النسخة" icon={Truck} shade="purple" />
            <Kpi title="تحتاج مراجعة سلامة" value={fmt(unreviewed)} suffix="موقع" desc="موقوفة عن الاعتماد" icon={ShieldAlert} shade="orange" />
          </section>
          <section className="two-col main-dashboard"><div className="panel map-panel"><CardTitle title="التوزيع المكاني للركام" sub="اضغط على نقطة لعرض سجل الموقع" action={<button className="text-link" onClick={()=>changePage('sites')}>استعراض الخريطة <ArrowLeft size={15}/></button>}/><MapView sites={db.sites} selectedId={selected} onPick={openSite}/></div><div className="panel insight-panel"><CardTitle title="الحالة التشغيلية" sub="توزيع مواقع العرض حسب حالة المتابعة"/><div className="donut-line"><div className="donut" style={{background:`conic-gradient(#5FA9A6 0 ${db.sites.filter(s=>s.status==='active').length/Math.max(1,db.sites.length)*100}%, #C18A39 ${db.sites.filter(s=>s.status==='active').length/Math.max(1,db.sites.length)*100}% ${((db.sites.filter(s=>s.status==='active'||s.status==='needs_review').length)/Math.max(1,db.sites.length))*100}%, #A9A18D ${((db.sites.filter(s=>s.status==='active'||s.status==='needs_review').length)/Math.max(1,db.sites.length))*100}% 100%)`}}><div><b>{fmt(db.sites.length)}</b><small>إجمالي المواقع</small></div></div><div className="status-list"><div><i style={{background:'#5FA9A6'}}/>قيد المتابعة <strong>{fmt(db.sites.filter(s=>s.status==='active').length)}</strong></div><div><i style={{background:'#C18A39'}}/>بانتظار مراجعة <strong>{fmt(db.sites.filter(s=>s.status==='needs_review').length)}</strong></div><div><i style={{background:'#A9A18D'}}/>حالات أخرى <strong>{fmt(db.sites.filter(s=>!['active','needs_review'].includes(s.status)).length)}</strong></div></div></div><div className="mini-divider"/><div className="insight-summary"><span><b>{fmt(activeOrders)}</b> أوامر قيد المتابعة</span><span><b>{fmt(inTransit)}</b> م³ قيد الاستلام</span></div></div></section>
          <section className="two-col lower-dashboard"><div className="panel"><CardTitle title="أحدث المواقع" sub="آخر السجلات ضمن مساحة العرض" action={<button className="text-link" onClick={()=>changePage('sites')}>عرض الكل <ArrowLeft size={15}/></button>}/><div className="simple-list">{db.sites.slice(0,5).map(s=><button key={s.id} className="site-list-row" onClick={()=>openSite(s.id)}><span className="site-symbol" style={{background:colorFor(s.status)+'1e',color:colorFor(s.status)}}><MapPin size={18}/></span><span className="site-row-copy"><b>{s.name}</b><small>{s.governorate} · {s.id}</small></span><span className="list-volume">{fmt(s.estimatedVolume)} <small>م³</small></span><ChevronLeft size={16} color="#7C8274"/></button>)}</div></div><div className="panel"><CardTitle title="مؤشرات المحافظات" sub="الكمية التقديرية المجمعة في بيانات العرض"/><div className="gov-chart">{totalByGov.map(x=><div className="gov-row" key={x.g}><div><span>{x.g}</span><b>{fmt(x.vol)} م³</b></div><div className="gov-bar"><span style={{width:(x.vol/Math.max(1,...totalByGov.map(i=>i.vol))*100)+'%'}}/></div></div>)}</div></div></section>
        </>}

        {page==='sites'&&<>
          <section className="panel filter-panel"><div className="search-control"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="البحث بالاسم أو رقم الموقع أو المنطقة" aria-label="بحث المواقع"/></div><div className="filters-group"><select aria-label="المحافظة" value={governorate} onChange={e=>setGovernorate(e.target.value)}><option>الكل</option>{governorates.map(g=><option key={g}>{g}</option>)}</select><select aria-label="حالة الموقع" value={siteStatus} onChange={e=>setSiteStatus(e.target.value)}><option value="الكل">جميع الحالات</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select><button className="btn btn-outline" onClick={()=>{setQuery('');setGovernorate('الكل');setSiteStatus('الكل')}}><RotateCcw size={15}/> مسح التصفية</button></div></section>
          <section className="two-col sites-layout"><div className="panel map-panel"><CardTitle title="الخريطة الجغرافية" sub={`يعرض ${fmt(filtered.length)} موقع من أصل ${fmt(db.sites.length)}`}/><MapView sites={filtered} selectedId={selected} onPick={setSelected} large/></div><div className="panel details-panel"><CardTitle title="بيانات الموقع" sub="حدد موقعًا على الخريطة أو في الجدول"/>{selectedSite?<div className="selected-site"><div className="selected-heading"><div><small>{selectedSite.id} / {selectedSite.governorate}</small><h3>{selectedSite.name}</h3></div>{statusBadge(selectedSite.status)}</div><div className="selected-grid"><div><small>الكمية التقديرية</small><b>{fmt(selectedSite.estimatedVolume)} <em>م³</em></b></div><div><small>تصنيف الركام</small><b>{selectedSite.category}</b></div><div><small>المنطقة</small><b>{selectedSite.area}</b></div><div><small>حالة مراجعة السلامة</small><b>{selectedSite.safetyReview?'موثّقة تجريبيًا':'غير موثّقة'}</b></div></div><div className="coordinates">{selectedSite.lat.toFixed(5)}° N · {selectedSite.lng.toFixed(5)}° E</div><p className="note-text">{selectedSite.note||'لا توجد ملاحظات'}</p>{!selectedSite.safetyReview?<button className="btn btn-warning btn-block" onClick={()=>markReviewed(selectedSite.id)}><ShieldAlert size={16}/> محاكاة توثيق مراجعة السلامة</button>:<Field label="تحديث الحالة التجريبية"><select value={selectedSite.status} onChange={e=>updateSite(selectedSite.id,e.target.value as SiteStatus)}>{Object.entries(statuses).filter(([key])=>key!=='needs_review').map(([key,v])=><option key={key} value={key}>{v.label}</option>)}</select></Field>}<button className="btn btn-danger-outline" onClick={()=>deleteSite(selectedSite.id)}><Trash2 size={15}/> حذف الموقع</button></div>:<Empty title="لم يتم تحديد موقع" detail="اختر نقطة من الخريطة أو سجلًا من الجدول"/>}</div></section>
          <section className="panel data-table-panel"><CardTitle title="سجل مواقع الركام" sub="المواقع قابلة للبحث والفرز والتصدير" action={<div className="export-actions"><button className="small-button" onClick={geoExport}><FileJson size={16}/> GeoJSON</button><button className="small-button" onClick={csvExport}><FileSpreadsheet size={16}/> CSV</button></div>}/><div className="table-scroll"><table><thead><tr><th>رقم الموقع</th><th>الموقع / المنطقة</th><th>المحافظة</th><th>الكمية التقديرية</th><th>مراجعة السلامة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{filtered.map(s=><tr key={s.id} className={selected===s.id?'row-selected':''}><td className="mono">{s.id}</td><td><b>{s.name}</b><small>{s.area}</small></td><td>{s.governorate}</td><td>{fmt(s.estimatedVolume)} م³</td><td>{s.safetyReview?<span className="verify"><CheckCircle2 size={15}/> موثقة تجريبيًا</span>:<span className="not-verify"><ShieldAlert size={15}/> لم تُراجع</span>}</td><td>{statusBadge(s.status)}</td><td><button className="table-action" onClick={()=>setSelected(s.id)}>عرض <ChevronLeft size={14}/></button></td></tr>)}</tbody></table>{filtered.length===0&&<Empty title="لا توجد نتائج" detail="غيّر معايير التصفية أو أضف موقعًا جديدًا"/>}</div></section>
        </>}

        {page==='survey'&&<SurveyWorkspace sites={db.sites} onCreate={saveSurvey} onViewSites={()=>changePage('sites')}/>}
        {page==='orders'&&<><section className="kpi-grid kpi-three"><Kpi title="إجمالي أوامر العمل" value={fmt(db.orders.length)} suffix="أمر" desc="الأوامر المنشأة في العرض" icon={ClipboardList} shade="blue"/><Kpi title="الأوامر النشطة" value={fmt(activeOrders)} suffix="أمر" desc="معتمدة أو قيد المتابعة" icon={Activity} shade="teal"/><Kpi title="مسودات وتحت الإعداد" value={fmt(db.orders.filter(o=>o.status==='draft').length)} suffix="أمر" desc="لم تعتمد إداريًا" icon={Clock3} shade="orange"/></section><section className="panel data-table-panel"><CardTitle title="قائمة أوامر العمل" sub="لا يمكن اعتماد أمر يرتبط بموقع لم تُراجع سلامته"/><div className="table-scroll"><table><thead><tr><th>رقم الأمر</th><th>موقع الركام</th><th>فريق التنفيذ</th><th>الكمية المستهدفة</th><th>الحالة</th><th>المحمّل</th><th>المستلم بمحضر</th><th>معلّقة</th><th>تقدم الاستلام</th><th>تغيير الحالة</th></tr></thead><tbody>{db.orders.map(o=><tr key={o.id}><td className="mono">{o.id}</td><td><b>{db.sites.find(s=>s.id===o.siteId)?.name||'موقع غير معروف'}</b><small>{o.siteId}</small></td><td>{o.contractor}</td><td>{fmt(o.targetVolume)} م³</td><td><span className="badge badge-blue">{workStatuses[o.status]}</span></td><td>{fmt(workOrderProgress(o,db.trips).loadedM3)} م³</td><td>{fmt(workOrderProgress(o,db.trips).confirmedM3)} م³</td><td>{fmt(workOrderProgress(o,db.trips).pendingTrips+workOrderProgress(o,db.trips).disputedTrips)} رحلة</td><td>{fmt(workOrderProgress(o,db.trips).progressPercent)}%</td><td><select aria-label={'تغيير حالة '+o.id} value={o.status} onChange={e=>changeOrder(o,e.target.value as WorkStatus)}>{Object.entries(workStatuses).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></td></tr>)}</tbody></table>{!db.orders.length&&<Empty title="لا توجد أوامر" detail="أنشئ أمر عمل مرتبطًا بموقع تمت مراجعته"/>}</div></section></>}

        {page==='trips'&&<OperationsWorkspace view="trips" db={db} onDispatch={()=>setDialog('trip')} onAddVehicle={saveVehicle} onToggleVehicle={toggleVehicle} onReceive={receiveTrip} onResolve={settleTrip} onExport={exportOperationsCsv}/>}
        {page==='fleet'&&<OperationsWorkspace view="fleet" db={db} onDispatch={()=>setDialog('trip')} onAddVehicle={saveVehicle} onToggleVehicle={toggleVehicle} onReceive={receiveTrip} onResolve={settleTrip} onExport={exportOperationsCsv}/>}
        {page==='reconciliation'&&<OperationsWorkspace view="reconciliation" db={db} onDispatch={()=>setDialog('trip')} onAddVehicle={saveVehicle} onToggleVehicle={toggleVehicle} onReceive={receiveTrip} onResolve={settleTrip} onExport={exportOperationsCsv}/>}

                {page==='facilities'&&<><div className="facilities-grid">{facilities.map(facility=>{const t=db.trips.filter(x=>x.facility===facility),p=receiptMetrics(t);return <div className="panel facility-card" key={facility}>
          <div className="facility-top"><div className="facility-icon"><Factory size={25}/></div><span className="badge badge-blue">تجريبي</span></div>
          <h3>{facility}</h3><p>مركز افتراضي — لا يمثل منشأة حقيقية أو ميزان قياس فعلي</p>
          <div className="facility-volume"><b>{fmt(p.confirmedM3)}</b><span>م³ مسجلة بمحضر محلي</span></div>
          <div className="facility-bottom"><span><Truck size={15}/>{fmt(p.totalTrips)} حمولة</span><span><Clock3 size={15}/>{fmt(p.pendingTrips+p.disputedTrips)} معلقة</span></div>
          <p className="note-text">سجلات قديمة غير مؤكدة: {fmt(p.legacyM3)} م³</p>
        </div>})}</div>
        <OperationsWorkspace view="reports" db={db} onDispatch={()=>setDialog('trip')} onAddVehicle={saveVehicle} onToggleVehicle={toggleVehicle} onReceive={receiveTrip} onResolve={settleTrip} onExport={exportOperationsCsv}/>
        </>}

        {page==='reports'&&<><section className="kpi-grid"><Kpi title="المواقع الكلية" value={fmt(db.sites.length)} suffix="موقع" desc="موجودة في السجل المحلي" icon={MapPin} shade="blue"/><Kpi title="كميات مقدرة" value={fmt(totalEstimate)} suffix="م³" desc="غير مساوية للكميات المنقولة" icon={Layers3} shade="purple"/><Kpi title="كميات مستلمة" value={fmt(received)} suffix="م³" desc="قياس منفصل برقم محضر محلي فقط" icon={CheckCircle2} shade="teal"/><Kpi title="مواقع لم تُراجع" value={fmt(unreviewed)} suffix="موقع" desc="تحتاج تحققًا مختصًا" icon={ShieldAlert} shade="orange"/></section><section className="two-col"><div className="panel"><CardTitle title="توزيع الكميات التقديرية" sub="حسب المحافظة في بيانات التدريب"/><div className="gov-chart gov-chart-big">{totalByGov.map(x=><div className="gov-row" key={x.g}><div><span>{x.g}</span><b>{fmt(x.vol)} م³</b></div><div className="gov-bar"><span style={{width:(x.vol/Math.max(1,...totalByGov.map(i=>i.vol))*100)+'%'}}/></div></div>)}</div></div><div className="panel"><CardTitle title="مخرجات قابلة للتنزيل" sub="لا تُصدّر أي بيانات حقيقية أو مركزيّة"/><div className="download-list"><button onClick={csvExport}><FileSpreadsheet size={20}/><span><strong>سجل المواقع CSV</strong><small>للمراجعة في Excel</small></span><Download size={18}/></button><button onClick={geoExport}><FileJson size={20}/><span><strong>ملف المواقع GeoJSON</strong><small>للاستخدام في برامج GIS</small></span><Download size={18}/></button><button onClick={exportBackup}><Database size={20}/><span><strong>نسخة بيانات المشروع JSON</strong><small>تضم المواقع والأوامر والحمولات</small></span><Download size={18}/></button></div></div></section><section className="panel"><CardTitle title="معايير قراءة النتائج"/><div className="report-footnotes"><p><ShieldAlert size={18}/> المقادير التقديرية ليست قياسات تحميل أو أوزان فعلية، ولا يجوز جمعها مع الاستلام باعتبارها مؤشرات إنجاز متجانسة.</p><p><CheckCircle2 size={18}/> الكميات المستلمة تستخرج فقط من الحمولات التي تم توثيق حالتها تجريبيًا «مستلمة».</p><p><CloudOff size={18}/> البيانات محفوظة على هذا المتصفح فقط؛ لا يوجد اعتماد مؤسسي أو تدقيق مركزي حتى الآن.</p></div></section><OperationsWorkspace view="reports" db={db} onDispatch={()=>setDialog('trip')} onAddVehicle={saveVehicle} onToggleVehicle={toggleVehicle} onReceive={receiveTrip} onResolve={settleTrip} onExport={exportOperationsCsv}/></>}

        {page==='settings'&&<><section className="two-col settings-layout"><div className="panel"><CardTitle title="حفظ البيانات ونقلها" sub="نسخة محلية على الجهاز، لا توجد مزامنة تلقائية"/><div className="setting-actions"><button onClick={exportBackup}><Download size={20}/><span><strong>تنزيل نسخة احتياطية</strong><small>يحفظ السجلات في ملف JSON مستقل</small></span><ChevronLeft size={18}/></button><button onClick={()=>fileRef.current?.click()}><UploadCloud size={20}/><span><strong>استيراد نسخة تجريبية</strong><small>تستبدل السجلات المحلية بعد التأكيد</small></span><ChevronLeft size={18}/></button><button onClick={restore}><RotateCcw size={20}/><span><strong>إعادة بيانات العرض الأصلية</strong><small>يحذف التعديلات التجريبية في المتصفح</small></span><ChevronLeft size={18}/></button></div><input ref={fileRef} className="sr-only" type="file" accept=".json,application/json" onChange={e=>void importBackup(e.target.files?.[0])}/></div><div className="panel"><CardTitle title="حالة الجاهزية" sub="تحديد واضح لما هو متاح وما هو قيد التطوير"/><div className="readiness-list"><div><CheckCircle2 size={18}/><span>خرائط وإدارة بيانات توضيحية</span><b>متاح</b></div><div><CheckCircle2 size={18}/><span>التقارير والتصدير المحلي</span><b>متاح</b></div><div className="pending"><Clock3 size={18}/><span>PostGIS وقاعدة بيانات مركزية</span><b>لاحقًا</b></div><div className="pending"><Clock3 size={18}/><span>دخول المستخدمين والصلاحيات</span><b>لاحقًا</b></div><div className="pending"><Clock3 size={18}/><span>تدقيق مركزي واعتمادات فعلية</span><b>لاحقًا</b></div><div className="pending"><Clock3 size={18}/><span>مزامنة PWA والعمل الميداني</span><b>لاحقًا</b></div></div></div></section><section className="panel"><CardTitle title="سجل نشاط هذه النسخة" sub="سجل محلي توضيحي غير محصن ضد التعديل"/><div className="audit-list">{db.audit.slice(0,15).map(a=><div key={a.id}><div className="audit-dot"/><span>{a.action}</span><small>{a.at}</small></div>)}</div></section></>}
      </main>
      <footer className="footer"><span>RukamGIS v0.3 · منصة تجريبية لإدارة بيانات الركام</span><span>غير مخصص للاستخدام التشغيلي الفعلي · © 2026</span></footer>
    </div>

    {dialog&&<div className="dialog-shade" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}><div className="modal" role="dialog" aria-modal="true" aria-label={dialog==='site'?'إضافة موقع ركام':dialog==='order'?'إضافة أمر عمل':'إضافة حمولة'}><div className="modal-head"><div><span>RUKAMGIS / NEW RECORD</span><h2>{dialog==='site'?'إضافة موقع ركام':dialog==='order'?'إنشاء أمر عمل': 'تسجيل حمولة نقل'}</h2><p>يُحفظ السجل في متصفحك لغرض العرض فقط</p></div><button className="icon-button" onClick={()=>setDialog(null)} aria-label="إغلاق"><X size={20}/></button></div>
      <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(dialog==='site')saveSite(f);else if(dialog==='order')saveOrder(f);else saveTrip(f)}}><div className="modal-body">
      {dialog==='site'&&<><div className="field-grid"><Field label="اسم الموقع"><input name="name" required minLength={3} placeholder="مثل قطاع تجريبي 08"/></Field><Field label="المحافظة"><select name="governorate">{governorates.map(g=><option key={g}>{g}</option>)}</select></Field><Field label="رمز المنطقة"><input name="area" required placeholder="منطقة تجريبية"/></Field><Field label="تصنيف الركام"><select name="category"><option>مختلط</option><option>خرسانة</option><option>مواد إنشائية</option><option>غير مصنف</option></select></Field><Field label="خط العرض Latitude"><input name="lat" type="number" step="any" min="-90" max="90" required placeholder="31.4"/></Field><Field label="خط الطول Longitude"><input name="lng" type="number" step="any" min="-180" max="180" required placeholder="34.4"/></Field><Field label="الكمية التقديرية (م³)"><input name="estimatedVolume" type="number" min="0" step="0.01" required placeholder="1000"/></Field></div><Field label="ملاحظات توضيحية"><textarea name="note" rows={3} placeholder="ملاحظات مختصرة عن السجل التجريبي"/></Field><div className="form-hint"><ShieldAlert size={17}/> يبدأ أي موقع جديد بحالة «بانتظار مراجعة السلامة»، ولا يمكن اعتماده تلقائيًا.</div></>}
      {dialog==='order'&&<><Field label="الموقع المرتبط"><select name="siteId" required>{reviewedOptions.map(s=><option value={s.id} key={s.id}>{s.name} · {s.id}</option>)}</select></Field><Field label="الفريق أو الجهة (تجريبي)"><input name="contractor" required placeholder="الفريق التجريبي"/></Field><Field label="الكمية المخططة (م³)"><input name="targetVolume" type="number" min="0.01" step="0.01" required/></Field><div className="form-hint"><ShieldAlert size={17}/> يُنشأ أمر العمل كمسودة ولا يعني اعتماد تنفيذ أو سلامة. تظهر فقط المواقع التي وُثقت مراجعتها تجريبيًا.</div>{reviewedOptions.length===0&&<p className="error-message">لا توجد مواقع تمت مراجعتها في بيانات العرض</p>}</>}
      {dialog==='trip'&&<><Field label="أمر العمل"><select name="orderId" required>{activeOrderOptions.map(o=><option value={o.id} key={o.id}>{o.id} · {db.sites.find(s=>s.id===o.siteId)?.name}</option>)}</select></Field><Field label="المركبة المسجلة"><select name="vehicle" required>{db.vehicles.filter(v=>v.active).map(v=><option value={v.code} key={v.code}>{v.code} — سعة {fmt(v.capacityM3)} م³</option>)}</select></Field><Field label="كمية الحمولة (م³)"><input name="volume" type="number" min="0.01" step="0.01" required/></Field><Field label="مرفق الاستلام"><select name="facility">{facilities.map(f=><option key={f}>{f}</option>)}</select></Field><div className="form-hint"><Clock3 size={17}/> تسجل الحمولة بانتظار الاستلام، ولن تدخل في الإجمالي المستلم إلا بعد محاكاة توثيق الاستلام.</div>{activeOrderOptions.length===0&&<p className="error-message">لا يوجد أمر معتمد أو نشط لتسجيل حمولة عليه</p>}</>}
      </div><div className="modal-footer"><button type="button" className="btn btn-outline" onClick={()=>setDialog(null)}>إلغاء</button><button type="submit" className="btn btn-primary" disabled={dialog==='order'&&!reviewedOptions.length||dialog==='trip'&&!activeOrderOptions.length||dialog==='trip'&&!db.vehicles.some(v=>v.active)}><Plus size={17}/> حفظ السجل التجريبي</button></div></form>
      </div></div>}
    {toast&&<div className="toast" role="status"><CheckCircle2 size={18}/>{toast}<button onClick={()=>setToast('')} aria-label="إغلاق"><X size={16}/></button></div>}
  </div>;
}
function Kpi({title,value,suffix,desc,icon:Icon,shade}:{title:string;value:string;suffix:string;desc:string;icon:any;shade:string}){return <div className={'kpi kpi-'+shade}><div className="kpi-top"><span>{title}</span><div className="kpi-icon"><Icon size={20}/></div></div><div className="kpi-value"><strong>{value}</strong><small>{suffix}</small></div><div className="kpi-desc">{desc}</div><div className="kpi-decoration"/></div>}
