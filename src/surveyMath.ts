/**
 * RukamGIS v0.2 survey geometry and quantity estimates.
 * All calculations are preliminary training estimates, not engineer approvals.
 * GeoJSON coordinates always use [longitude, latitude] (WGS84).
 */
export type Position = [number, number];
export type SurveyGeometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'Polygon'; coordinates: Position[][] };

export type SurveyEstimate = {
  method: 'footprint-depth';
  areaSqm: number;
  averageDepthM: number;
  adjustmentFactor: number;
  uncertaintyPct: number;
  volumeM3: number;
  lowerM3: number;
  upperM3: number;
  areaSource: 'measured-polygon' | 'manual';
};

const EARTH_RADIUS = 6371008.8;
const rad = (angle:number) => angle*Math.PI/180;
const finite = (v:number) => Number.isFinite(v);

export function validPosition(p:unknown):p is Position {
  return Array.isArray(p) && p.length === 2 && typeof p[0]==='number' && typeof p[1]==='number'
    && finite(p[0]) && finite(p[1]) && p[0]>=-180 && p[0]<=180 && p[1]>=-90 && p[1]<=90;
}
export function distanceMetres(a:Position,b:Position):number {
  if(!validPosition(a)||!validPosition(b))throw new Error('إحداثيات غير صالحة');
  const dLat=rad(b[1]-a[1]), dLon=rad(b[0]-a[0]);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 2*EARTH_RADIUS*Math.asin(Math.min(1,Math.sqrt(Math.max(0,h))));
}
export function lineLengthMetres(points:Position[]):number {
  if(!Array.isArray(points)||!points.every(validPosition))throw new Error('خط غير صالح');
  return points.slice(1).reduce((acc,p,i)=>acc+distanceMetres(points[i],p),0);
}
function orient(a:Position,b:Position,c:Position):number {
  return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
}
function onSegment(a:Position,b:Position,c:Position):boolean {
  return b[0]>=Math.min(a[0],c[0])-1e-12&&b[0]<=Math.max(a[0],c[0])+1e-12&&
    b[1]>=Math.min(a[1],c[1])-1e-12&&b[1]<=Math.max(a[1],c[1])+1e-12;
}
function intersects(a:Position,b:Position,c:Position,d:Position):boolean {
  const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
  if ((o1>0&&o2<0||o1<0&&o2>0)&&(o3>0&&o4<0||o3<0&&o4>0))return true;
  return (Math.abs(o1)<1e-12&&onSegment(a,c,b)) ||
    (Math.abs(o2)<1e-12&&onSegment(a,d,b)) ||
    (Math.abs(o3)<1e-12&&onSegment(c,a,d)) ||
    (Math.abs(o4)<1e-12&&onSegment(c,b,d));
}
export function closePolygon(vertices:Position[]):Position[] {
  if(!Array.isArray(vertices)||vertices.length<3||vertices.length>500||!vertices.every(validPosition))
    throw new Error('المضلع يتطلب 3 رؤوس صالحة على الأقل (بحد أقصى 500)');
  const ring=vertices.map(p=>[p[0],p[1]] as Position);
  if(ring.length>3 && ring[0][0]===ring[ring.length-1]?.[0]&&ring[0][1]===ring[ring.length-1]?.[1])ring.pop();
  if(ring.length<3)throw new Error('عدد رؤوس المضلع غير كافٍ');
  for(let i=0;i<ring.length;i++){
    if(distanceMetres(ring[i],ring[(i+1)%ring.length])<0.05)throw new Error('رؤوس متطابقة أو متقاربة جدًا');
  }
  // Reject crossing edges rather than reporting a misleading area.
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    for(let j=i+1;j<ring.length;j++){
      if(j===i+1||(i===0&&j===ring.length-1))continue;
      if(intersects(a,b,ring[j],ring[(j+1)%ring.length]))
        throw new Error('حدود المضلع متقاطعة، عدّل الرسم');
    }
  }
  return [...ring, [...ring[0]] as Position];
}
export function polygonAreaSqm(ring:Position[]):number {
  const closed=closePolygon(ring);
  // Spherical excess formula for small geographic polygons (approximation).
  let integral=0;
  for(let i=0;i<closed.length-1;i++){
    const [lonA,latA]=closed[i], [lonB,latB]=closed[i+1];
    let dLon=rad(lonB-lonA);
    if(dLon>Math.PI)dLon-=2*Math.PI;
    if(dLon<-Math.PI)dLon+=2*Math.PI;
    integral+=dLon*(2+Math.sin(rad(latA))+Math.sin(rad(latB)));
  }
  const area=Math.abs(integral*EARTH_RADIUS**2/2);
  if(!finite(area)||area<0.1)throw new Error('مساحة المضلع صغيرة جدًا أو غير صالحة');
  return area;
}
export function representativePoint(geometry:SurveyGeometry):Position {
  if(geometry.type==='Point')return geometry.coordinates;
  const ring=closePolygon(geometry.coordinates[0]);
  const n=ring.length-1;
  return [ring.slice(0,-1).reduce((s,p)=>s+p[0],0)/n,ring.slice(0,-1).reduce((s,p)=>s+p[1],0)/n];
}
export function estimateDebris(areaSqm:number,depthM:number,factor:number,uncertaintyPct:number,areaSource:'measured-polygon'|'manual'):SurveyEstimate {
  if(![areaSqm,depthM,factor,uncertaintyPct].every(finite)||areaSqm<=0||areaSqm>50000000 ||
     depthM<=0||depthM>100||factor<0.5||factor>3||uncertaintyPct<5||uncertaintyPct>75)
    throw new Error('تحقق من المساحة والعمق والمعامل ونسبة عدم اليقين');
  const volume=areaSqm*depthM*factor;
  return {
    method:'footprint-depth', areaSqm,averageDepthM:depthM,adjustmentFactor:factor,uncertaintyPct,
    volumeM3:Math.round(volume*100)/100,
    lowerM3:Math.round(Math.max(0,volume*(1-uncertaintyPct/100))*100)/100,
    upperM3:Math.round(volume*(1+uncertaintyPct/100)*100)/100,
    areaSource
  };
}
export function validSurveyGeometry(g:unknown):g is SurveyGeometry {
  try {
    if(!g||typeof g!=='object')return false;
    const v=g as SurveyGeometry;
    if(v.type==='Point')return validPosition(v.coordinates);
    if(v.type==='Polygon'&&Array.isArray(v.coordinates)&&v.coordinates.length===1){
      return polygonAreaSqm(v.coordinates[0])>0;
    }
  }catch{/* invalid polygon */}
  return false;
}
