import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertTriangle, Check, ClipboardList, Eraser, MapPin, MousePointer2,
  Pentagon, RotateCcw, Ruler, Save, Undo2, Route } from 'lucide-react';
import type { Site } from './data';
import { closePolygon, distanceMetres, estimateDebris, lineLengthMetres,
  polygonAreaSqm, representativePoint, validSurveyGeometry,
  type Position, type SurveyEstimate, type SurveyGeometry } from './surveyMath';

type Mode='select'|'point'|'polygon'|'line';
export type SurveySubmission={
  name:string;area:string;governorate:string;category:string;note:string;
  geometry:SurveyGeometry;estimate:SurveyEstimate;risks:string[];
};
type Props={sites:Site[];onCreate:(record:SurveySubmission)=>void;onViewSites:()=>void};
const draftKey='rukamgis-v02-field-draft';
const governorates=['شمال غزة','غزة','الوسطى','خان يونس','رفح'];
const risks=['اشتباه مخلفات خطرة','عدم استقرار إنشائي','عوائق وصول','مخاطر غير محددة'];
const format=(n:number,digits=1)=>new Intl.NumberFormat('ar-PS',{maximumFractionDigits:digits}).format(n);
const initial={
  name:'',area:'',governorate:'غزة',category:'مختلط',note:'',
  manualArea:'',depth:'1.2',factor:'1',uncertainty:'25',risks:[] as string[],vertices:[] as Position[]
};
function readDraft():typeof initial {
  try{
    const data=JSON.parse(localStorage.getItem(draftKey)||'null');
    if(data&&typeof data.name==='string'&&Array.isArray(data.vertices)&&data.vertices.length<=500 &&
       data.vertices.every((v:unknown)=>Array.isArray(v)&&v.length===2&&
       v.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))))
      return {...initial,...data};
  }catch{/* invalid draft */}
  return initial;
}

export default function SurveyWorkspace({sites,onCreate,onViewSites}:Props){
  const saved=useRef(readDraft());
  const [mode,setMode]=useState<Mode>(saved.current.vertices.length>1?'polygon':'point');
  const [vertices,setVertices]=useState<Position[]>(saved.current.vertices);
  const [name,setName]=useState(saved.current.name);
  const [area,setArea]=useState(saved.current.area);
  const [governorate,setGovernorate]=useState(saved.current.governorate);
  const [category,setCategory]=useState(saved.current.category);
  const [note,setNote]=useState(saved.current.note);
  const [manualArea,setManualArea]=useState(saved.current.manualArea);
  const [depth,setDepth]=useState(saved.current.depth);
  const [factor,setFactor]=useState(saved.current.factor);
  const [uncertainty,setUncertainty]=useState(saved.current.uncertainty);
  const [riskFlags,setRiskFlags]=useState<string[]>(saved.current.risks);
  const [message,setMessage]=useState('');
  const node=useRef<HTMLDivElement>(null);
  const map=useRef<L.Map|null>(null);
  const drawingLayer=useRef<L.LayerGroup|null>(null);
  const siteLayer=useRef<L.LayerGroup|null>(null);
  const modeRef=useRef(mode);
  modeRef.current=mode;
  const addPoint=useRef<(p:Position)=>void>(()=>{});
  addPoint.current=(p)=>{
    setMessage('');
    if(modeRef.current==='point'){setVertices([p]);setMode('select');}
    else if(modeRef.current==='polygon'||modeRef.current==='line')
      setVertices(v=>v.length>=500?v:[...v,p]);
  };

  useEffect(()=>{
    if(!node.current||map.current)return;
    const instance=L.map(node.current,{center:[31.42,34.37],zoom:10,doubleClickZoom:false,scrollWheelZoom:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom:19
    }).addTo(instance);
    const onClick=(event:L.LeafletMouseEvent)=>addPoint.current([event.latlng.lng,event.latlng.lat]);
    instance.on('click',onClick);
    drawingLayer.current=L.layerGroup().addTo(instance);
    siteLayer.current=L.layerGroup().addTo(instance);
    map.current=instance;
    const task=window.setTimeout(()=>instance.invalidateSize(),100);
    return()=>{clearTimeout(task);instance.off('click',onClick);instance.remove();map.current=null;drawingLayer.current=null;siteLayer.current=null;};
  },[]);
  useEffect(()=>{
    const group=siteLayer.current;if(!group)return;
    group.clearLayers();
    for(const s of sites){
      if(validSurveyGeometry(s.geometry)&&s.geometry.type==='Polygon'){
        const coords=s.geometry.coordinates[0].map(([lng,lat])=>[lat,lng] as L.LatLngTuple);
        L.polygon(coords,{color:'#82916D',weight:2,fillColor:'#ADB89B',fillOpacity:.14,interactive:false}).addTo(group);
      } else if(Number.isFinite(s.lat)&&Number.isFinite(s.lng)){
        L.circleMarker([s.lat,s.lng],{radius:4,color:'#607A66',fillColor:'#607A66',fillOpacity:.5,interactive:false}).addTo(group);
      }
    }
  },[sites]);
  useEffect(()=>{
    const group=drawingLayer.current;if(!group)return;
    group.clearLayers();
    if(vertices.length===0)return;
    for(const [lng,lat] of vertices)L.circleMarker([lat,lng],{radius:5,color:'#FFF',weight:2,fillColor:'#C0674B',fillOpacity:1,interactive:false}).addTo(group);
    if(vertices.length>=2){
      const points=vertices.map(([lng,lat])=>[lat,lng] as L.LatLngTuple);
      if(mode==='polygon'&&vertices.length>=3)L.polygon(points,{color:'#A64F35',weight:3,fillColor:'#C0674B',fillOpacity:.25,interactive:false}).addTo(group);
      else L.polyline(points,{color:'#A64F35',weight:3,dashArray:mode==='line'?'8 6':undefined,interactive:false}).addTo(group);
    }
  },[vertices,mode]);
  useEffect(()=>{
    try{localStorage.setItem(draftKey,JSON.stringify({name,area,governorate,category,note,manualArea,depth,factor,uncertainty,risks:riskFlags,vertices}));}
    catch{/* no local persistence */}
  },[name,area,governorate,category,note,manualArea,depth,factor,uncertainty,riskFlags,vertices]);

  const geomResult=useMemo(()=>{
    try{
      if(vertices.length>=3&&mode!=='line'&&mode!=='point'){
        const ring=closePolygon(vertices);
        return {area:polygonAreaSqm(ring),error:''};
      }
    }catch(e){return {area:0,error:e instanceof Error?e.message:'مضلع غير صالح'};}
    return {area:0,error:''};
  },[vertices,mode]);
  const lineLength=useMemo(()=>vertices.length>=2&&mode==='line'?lineLengthMetres(vertices):0,[vertices,mode]);
  const lastStep=vertices.length>=2?distanceMetres(vertices[vertices.length-2],vertices[vertices.length-1]):0;
  const isPolygon=mode==='polygon'&&vertices.length>=3;
  const effectiveArea=isPolygon?geomResult.area:Number(manualArea);
  const calculation=useMemo(()=>{
    try{
      return {estimate:estimateDebris(effectiveArea,Number(depth),Number(factor),Number(uncertainty),
        isPolygon?'measured-polygon':'manual'),error:''};
    }catch(e){return {estimate:null,error:e instanceof Error?e.message:'قِيَم غير صالحة'};}
  },[effectiveArea,depth,factor,uncertainty,isPolygon]);
  const changeTool=(next:Mode)=>{
    setMode(next);setVertices([]);setMessage('');
    if(next==='select')setMessage('يمكنك معاينة الخريطة. اختر أداة رسم لتحديد موقع جديد.');
  };
  const clear=()=>{setVertices([]);setMessage('تم مسح الرسم الحالي فقط');};
  const reset=()=>{
    if(!window.confirm('مسح مسودة الحصر والرسم الحالي؟ لا تُمس السجلات المحفوظة.'))return;
    setMode('point');setVertices([]);setName('');setArea('');setGovernorate('غزة');
    setCategory('مختلط');setNote('');setManualArea('');setDepth('1.2');setFactor('1');
    setUncertainty('25');setRiskFlags([]);setMessage('تمت إعادة ضبط المسودة');
  };
  const submit=(e:React.FormEvent)=>{
    e.preventDefault();
    if(name.trim().length<3||!area.trim()){setMessage('أدخل اسم موقع ووصف منطقة صالحين');return;}
    if(mode==='line'){setMessage('الخط للقياس فقط. اختر نقطة أو مضلعًا لحفظ موقع ركام.');return;}
    let geometry:SurveyGeometry;
    try{
      if(isPolygon)geometry={type:'Polygon',coordinates:[closePolygon(vertices)]};
      else if(vertices.length===1)geometry={type:'Point',coordinates:vertices[0]};
      else throw new Error('ارسم نقطة واحدة أو مضلعًا من ثلاث نقاط على الخريطة');
      if(!validSurveyGeometry(geometry))throw new Error('الهندسة الجغرافية غير صالحة');
      if(!calculation.estimate)throw new Error(calculation.error);
    }catch(error){setMessage(error instanceof Error?error.message:'تعذر حفظ الحصر');return;}
    onCreate({name:name.trim(),area:area.trim(),governorate,category,note:note.trim(),geometry,
      estimate:calculation.estimate!,risks:riskFlags});
    setVertices([]);setName('');setArea('');setNote('');setManualArea('');setRiskFlags([]);
    setMode('point');setMessage('تم تسجيل الحصر كمسودة غير معتمدة وإضافته لسجل المواقع');
  };
  const pointOrPolygon=vertices.length===1?'نقطة محددة':isPolygon?'مضلع محدد':'لم يكتمل الرسم';
  return <div className="survey-layout">
    <section className="survey-intro">
      <div><strong>المسح الميداني وتقدير كميات الركام</strong><p>اختر أداة رسم، حدّد الموقع على الخريطة، ثم أدخل القياسات. جميع الحسابات توضيحية وتحتاج تحققًا هندسيًا.</p></div>
      <button type="button" className="btn btn-outline" onClick={onViewSites}><ClipboardList size={16}/> سجل المواقع</button>
    </section>
    <div className="survey-workspace">
      <section className="panel survey-map-panel">
        <div className="survey-toolbar" role="toolbar" aria-label="أدوات الرسم الجغرافي">
          {([
            ['select','استعراض',MousePointer2],['point','نقطة',MapPin],
            ['polygon','مضلع',Pentagon],['line','قياس خط',Route]
          ] as const).map(([key,label,Icon])=><button type="button" key={key}
            className={'survey-tool '+(mode===key?'is-active':'')}
            aria-pressed={mode===key} onClick={()=>changeTool(key)}><Icon size={17}/>{label}</button>)}
          <button type="button" className="survey-tool" disabled={!vertices.length} onClick={()=>setVertices(v=>v.slice(0,-1))}><Undo2 size={16}/>تراجع نقطة</button>
          <button type="button" className="survey-tool" disabled={!vertices.length} onClick={clear}><Eraser size={16}/>مسح الرسم</button>
        </div>
        <div ref={node} className="survey-map" role="region" aria-label="خريطة الرسم الجغرافي"></div>
        <div className="survey-map-foot"><span><Ruler size={15}/> {mode==='line'?'طول الخط':mode==='polygon'?'محيط الرسم':'الهندسة'}:
          <b>{mode==='line'?format(lineLength)+' م':mode==='polygon'&&vertices.length>=2?format(lineLengthMetres([...vertices,vertices[0]]))+' م':pointOrPolygon}</b></span>
          <span>آخر مقطع: {format(lastStep)} م | عدد الرؤوس: {vertices.length}</span>
        </div>
        <p className="survey-map-tip">انقر على الخريطة لإضافة الرؤوس. لإغلاق المضلع تُوصَل آخر نقطة بالأولى تلقائيًا. لحساب المساحة يلزم 3 رؤوس غير متقاطعة.</p>
      </section>
      <section className="panel survey-form-panel">
        <div className="card-title"><div><h3>استمارة الحصر</h3><p>مسودة محلية — لا تعني اعتماد سلامة الموقع</p></div><ClipboardList size={20}/></div>
        <form onSubmit={submit} className="survey-form">
          <label>اسم الموقع <input required minLength={3} value={name} onChange={e=>setName(e.target.value)} placeholder="مثال: قطاع تجريبي جديد"/></label>
          <div className="survey-form-row">
            <label>المحافظة <select value={governorate} onChange={e=>setGovernorate(e.target.value)}>{governorates.map(g=><option key={g}>{g}</option>)}</select></label>
            <label>المنطقة <input required value={area} onChange={e=>setArea(e.target.value)} placeholder="وصف مختصر"/></label>
          </div>
          <label>نوع الركام <select value={category} onChange={e=>setCategory(e.target.value)}>{['مختلط','خرسانة','مواد إنشائية','غير مصنف'].map(c=><option key={c}>{c}</option>)}</select></label>
          <div className="survey-estimator">
            <h4><Ruler size={17}/> محرك تقدير الكميات</h4>
            {isPolygon?<div className="survey-computed"><span>مساحة المضلع من الرسم (م²)</span><strong>{geomResult.error?geomResult.error:format(geomResult.area,2)}</strong></div>:
            <label>مساحة البصمة التقديرية (م²) <input value={manualArea} type="number" min="0.01" max="50000000" step="any" onChange={e=>setManualArea(e.target.value)} placeholder="أدخل مساحة مقاسة ميدانيًا"/></label>}
            <div className="survey-form-row">
              <label>متوسط سُمك الركام (م) <input type="number" min="0.01" max="100" step="0.01" value={depth} onChange={e=>setDepth(e.target.value)}/></label>
              <label>معامل التصحيح <input type="number" min="0.5" max="3" step="0.05" value={factor} onChange={e=>setFactor(e.target.value)}/></label>
            </div>
            <label>عدم اليقين التقديري (%) <input type="number" min="5" max="75" step="1" value={uncertainty} onChange={e=>setUncertainty(e.target.value)}/></label>
            <div className="survey-result" aria-live="polite">
              {calculation.estimate?<><span>الحجم التقديري (م³)</span><strong>{format(calculation.estimate.volumeM3,2)}</strong>
                <small>النطاق التقريبي: {format(calculation.estimate.lowerM3,2)} – {format(calculation.estimate.upperM3,2)} م³</small>
                <small>المساحة × متوسط السُمك × معامل التصحيح</small></>:
                <span>{calculation.error||'أدخل مساحة وقياسات صالحة'}</span>}
            </div>
          </div>
          <fieldset className="survey-risks"><legend>ملاحظات مخاطر تتطلب تقييمًا مختصًا</legend>
            {risks.map(r=><label key={r}><input type="checkbox" checked={riskFlags.includes(r)} onChange={e=>setRiskFlags(a=>e.target.checked?[...a,r]:a.filter(x=>x!==r))}/>{r}</label>)}
          </fieldset>
          <label>ملاحظات الحصر <textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="بيانات وصفية دون أسماء أفراد أو مواقع حساسة"/></label>
          <p className="survey-warning"><AlertTriangle size={16}/> المواقع والنتائج بيانات تدريبية فقط؛ لا تُدخل معلومات حقيقية أو حساسة. لا يجوز استخدامها لتقدير المخاطر أو اتخاذ قرار إزالة.</p>
          {message&&<p className="survey-message" role="status">{message}</p>}
          <div className="survey-form-actions"><button type="button" className="btn btn-outline" onClick={reset}><RotateCcw size={16}/> مسح المسودة</button>
            <button type="submit" className="btn btn-primary"><Save size={16}/> حفظ حصر تجريبي</button></div>
        </form>
      </section>
    </div>
  </div>;
}
