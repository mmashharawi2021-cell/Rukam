import test from 'node:test';
import assert from 'node:assert/strict';
import {
 closePolygon, polygonAreaSqm, lineLengthMetres, distanceMetres, estimateDebris,
 validSurveyGeometry, representativePoint
} from '../src/surveyMath.ts';

const square=[
  [34.4,31.4],[34.401,31.4],[34.401,31.401],[34.4,31.401]
];

test('polygon closes and area is plausible in square metres',()=>{
  const closed=closePolygon(square);
  assert.equal(closed.length,5);
  assert.deepEqual(closed[0],closed[4]);
  const area=polygonAreaSqm(square);
  assert.ok(area>9000&&area<12000, 'local 0.001-degree square around Gaza');
});
test('line measurement uses geodesic metres',()=>{
  assert.equal(lineLengthMetres([square[0]]),0);
  const d=distanceMetres(square[0],square[1]);
  assert.ok(d>90&&d<105);
  assert.ok(lineLengthMetres(square.slice(0,3))>200);
});
test('crossed and degenerate polygons rejected',()=>{
  assert.throws(()=>closePolygon([[34,31],[34.002,31.002],[34,31.002],[34.002,31]]));
  assert.throws(()=>closePolygon([[34,31],[34,31],[34.002,31.001]]));
  assert.throws(()=>closePolygon([[34,31],[34.001,31]]));
});
test('estimate is transparent and uncertainty bounds are symmetric',()=>{
  const v=estimateDebris(100,2,1,25,'manual');
  assert.equal(v.volumeM3,200);
  assert.equal(v.lowerM3,150);
  assert.equal(v.upperM3,250);
  assert.equal(v.method,'footprint-depth');
  assert.equal(v.areaSource,'manual');
});
test('invalid engineering inputs cannot be estimated',()=>{
  assert.throws(()=>estimateDebris(-1,1,1,25,'manual'));
  assert.throws(()=>estimateDebris(1,0,1,25,'manual'));
  assert.throws(()=>estimateDebris(1,1,0,25,'manual'));
  assert.throws(()=>estimateDebris(1,1,1,101,'manual'));
  assert.throws(()=>estimateDebris(Infinity,1,1,25,'manual'));
});
test('older point and new polygon geometries both validate',()=>{
  const point={type:'Point',coordinates:[34.4,31.4]};
  const polygon={type:'Polygon',coordinates:[closePolygon(square)]};
  assert.equal(validSurveyGeometry(point),true);
  assert.equal(validSurveyGeometry(polygon),true);
  assert.equal(validSurveyGeometry({type:'Point',coordinates:[999,31]}),false);
  const [lng,lat]=representativePoint(polygon);
  assert.ok(lng>34.4&&lng<34.401);
  assert.ok(lat>31.4&&lat<31.401);
});
