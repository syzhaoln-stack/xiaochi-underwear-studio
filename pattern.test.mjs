import test from 'node:test';
import assert from 'node:assert/strict';
import { draft, DEFAULTS, renderPatternSVG } from './pattern.js';

const close = (a, b, tol = 1e-7) => assert.ok(Math.abs(a-b) <= tol, `${a} ≠ ${b}`);
const length = pts => pts.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1]),0);

test('four complete pieces share stitch lengths and generate exact elastic arithmetic', () => {
  const m = draft();
  assert.equal(m.valid, true, m.errors.join('; '));
  assert.equal(m.pieces.length,4);
  const [f,b,g,l]=m.pieces;
  close(f.seams.sideLeft.length,b.seams.sideLeft.length);
  close(f.seams.sideRight.length,DEFAULTS.sideSeam);
  close(f.seams.gussetJoin.length,g.seams.frontJoin.length);
  close(b.seams.gussetJoin.length,g.seams.backJoin.length);
  assert.deepEqual(g.seamPoints,l.seamPoints);
  close(m.dimensions.legOpening,length(f.seams.legRight.points)+length(b.seams.legRight.points)+length(g.seams.legRight.points));
  close(m.dimensions.waistOpening,84*.96);
  close(m.dimensions.waistElastic,84*.96*.95+1.2);
  close(m.dimensions.legElastic,m.dimensions.legOpening*.95+1.2);
  close(m.dimensions.legElasticTotal,2*m.dimensions.legElastic);
});

test('all sampled curves are longer than chords and symmetric', () => {
  for(const piece of draft().pieces) {
    for(const side of ['legLeft','legRight']) {
      const s=piece.seams[side];
      assert.ok(s.length > Math.hypot(s.points.at(-1)[0]-s.points[0][0],s.points.at(-1)[1]-s.points[0][1]));
    }
    close(piece.seams.legLeft.length,piece.seams.legRight.length);
    close(piece.bounds.minX,-piece.bounds.maxX);
  }
});

test('cut edges are offset by requested normal distance, including distinct edge finishes', () => {
  const m=draft({seamAllowance:1.1,edgeAllowance:.45});
  assert.equal(m.valid,true,m.errors.join('; '));
  for(const piece of m.pieces) {
    for(let i=0;i<piece.seamPoints.length;i++) {
      const a=piece.seamPoints[i],b=piece.seamPoints[(i+1)%piece.seamPoints.length];
      const u=[b[0]-a[0],b[1]-a[1]], ul=Math.hypot(...u);
      for(const c of piece.cutEdges[i].points) {
        const signed=((c[0]-a[0])*u[1]-(c[1]-a[1])*u[0])/ul;
        close(signed,piece.edgeAllowances[i],1e-6);
      }
    }
  }
});

test('zero allowance gives seam geometry, no stroke-based pretend offset', () => {
  const m=draft({seamAllowance:0,edgeAllowance:0});
  assert.equal(m.valid,true,m.errors.join('; '));
  for(const piece of m.pieces) piece.points.forEach((p,i)=>{close(p[0],piece.seamPoints[i][0]);close(p[1],piece.seamPoints[i][1]);});
});

test('rise names do not secretly override supplied measurements', () => {
  const a=draft(),b=draft({rise:'high'}),c=draft({rise:'high',frontLength:22,backLength:25,sideSeam:13});
  assert.equal(c.valid,true,c.errors.join('; '));
  assert.deepEqual(a.pieces,b.pieces);
  close(c.dimensions.frontLength-a.dimensions.frontLength,4);
  close(c.dimensions.backLength-a.dimensions.backLength,4);
  close(c.pieces[0].seams.sideRight.length,13);
  assert.notDeepEqual(a.pieces,c.pieces);
});

test('measured openings only affect elastic and have unrounded precision', () => {
  const a=draft(),b=draft({waistOpeningOverride:80.37,legOpeningOverride:58.43,waistElasticPct:94,legElasticPct:93,overlap:1.2});
  assert.equal(b.valid,true);
  assert.deepEqual(a.pieces,b.pieces);
  close(b.dimensions.waistElastic,80.37*.94+1.2);
  close(b.dimensions.legElastic,58.43*.93+1.2);
  close(b.dimensions.waistElasticBasis,80.37);
});

test('invalid values and geometrically impossible drafts reject before export', () => {
  for(const input of [{waist:-1},{hip:NaN},{waist:''},{hip:null},{waist:true},{gussetLength:0},{frontLength:Infinity},
    {reductionPct:101},{seamAllowance:-.1},{edgeAllowance:-1},{waistElasticPct:0},{legOpeningOverride:-1},
    {waistOpeningOverride:'bad'},{rise:'low'},{waist:110,hip:100},{waist:50,hip:140,sideSeam:3},{frontLength:10,sideSeam:20}]) {
    const m=draft(input);
    assert.equal(m.valid,false,JSON.stringify(input));
    assert.ok(m.errors.length);
    assert.equal(renderPatternSVG(m),'');
  }
});

test('XL, XXL and two rises stay valid; unit conversions and four pieces are exported', () => {
  for(const input of [{waist:84,hip:104},{waist:92,hip:112},{waist:92,hip:112,rise:'high',frontLength:26,backLength:29,sideSeam:17}]) {
    const m=draft(input),s=renderPatternSVG(m);
    assert.equal(m.valid,true,m.errors.join('; '));
    assert.equal((s.match(/data-piece=/g)||[]).length,4);
    assert.match(s,/width="[\d.]+mm" height="[\d.]+mm"/);
    assert.match(s,/width="10" height="10"/);
    const header=s.match(/width="([\d.]+)mm" height="([\d.]+)mm" viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    close(Number(header[1]),Number(header[3])*10,.001);
    close(Number(header[2]),Number(header[4])*10,.001);
  }
});

test('FOE defaults reserve nothing at openings and allow 0.6 cm at joining seams', () => {
  assert.equal(DEFAULTS.seamAllowance,.6);
  assert.equal(DEFAULTS.edgeAllowance,0);
  assert.equal(DEFAULTS.overlap,1.2);
  const m=draft({rise:'high',frontLength:26,backLength:29,sideSeam:17});
  assert.equal(m.valid,true,m.errors.join('; '));
  for(const piece of m.pieces) {
    piece.edgeRoles.forEach((role,i)=>close(piece.edgeAllowances[i],['waist','leg'].includes(role)?0:.6));
  }
  close(m.pieces[0].seams.sideLeft.length,17);
  close(m.pieces[1].seams.sideLeft.length,17);
  const s=renderPatternSVG(m);
  assert.match(s,/接头额外用量 1.2 cm/);
  assert.doesNotMatch(s,/接头重叠量/);
});

test('front and back gusset joins are C1 continuous when the pattern is assembled flat', () => {
  const diff=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  const derivativeEnd=c=>diff(c[3],c[2]).map(v=>3*v);
  const derivativeStart=c=>diff(c[1],c[0]).map(v=>3*v);
  const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,(a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI;
  for(const input of [{},{rise:'high',frontLength:26,backLength:29,sideSeam:17},{waist:92,hip:112,rise:'high',frontLength:26,backLength:29,sideSeam:17}]) {
    const m=draft(input); assert.equal(m.valid,true,m.errors.join('; '));
    const [f,b,g]=m.pieces;
    for(const side of ['legRight','legLeft']) {
      const fc=f.seams[side].curve.controlPoints,bc=b.seams[side].curve.controlPoints,gc=g.seams[side].curve.controlPoints;
      // Assemble: front at origin; gusset translated below it; back reflected
      // vertically and traversed in reverse, as its B seam meets gusset B.
      const assembledG=gc.map(([x,y])=>[x,y+m.params.frontLength]);
      const assembledB=bc.map(([x,y])=>[x,m.params.frontLength+m.params.gussetLength+m.params.backLength-y]).reverse();
      for(let axis=0;axis<2;axis++) {
        close(fc[3][axis],assembledG[0][axis]);
        close(assembledG[3][axis],assembledB[0][axis]);
        close(derivativeEnd(fc)[axis],derivativeStart(assembledG)[axis]);
        close(derivativeEnd(assembledG)[axis],derivativeStart(assembledB)[axis]);
      }
      // The physical SVG uses fine line segments. Check their joint angle too,
      // rather than only checking the ideal Bezier derivative metadata.
      const fp=f.seams[side].points,gp=g.seams[side].points,bp=b.seams[side].points;
      const frontEnd=diff(fp.at(-1),fp.at(-2));
      const gussetStart=diff(gp[1],gp[0]),gussetEnd=diff(gp.at(-1),gp.at(-2));
      const backStored=diff(bp.at(-1),bp.at(-2)),backOutgoing=[-backStored[0],backStored[1]];
      assert.ok(angle(frontEnd,gussetStart)<3,`A sampled turn ${angle(frontEnd,gussetStart)}`);
      assert.ok(angle(gussetEnd,backOutgoing)<3,`B sampled turn ${angle(gussetEnd,backOutgoing)}`);
    }
  }
});

test('piece colours are consistent and canvas reserves room for large calibration notes', () => {
  const colors=['#b47f9c','#8c719f','#759c98','#dfbf81'];
  const cases=[{},
    {waist:60,hip:65,frontLength:14,backLength:16,sideSeam:6,gussetFront:3,gussetBack:3,gussetLength:8},
    {waist:180,hip:200,frontLength:42,backLength:46,sideSeam:26,gussetFront:14,gussetBack:18,gussetLength:28,waistElasticPct:115,legElasticPct:100,overlap:5},
    {waist:60,hip:80,frontLength:18,backLength:21,sideSeam:9,gussetFront:14,gussetBack:18,gussetLength:28},
  ];
  for(const input of cases) {
    const m=draft(input); assert.equal(m.valid,true,m.errors.join('; '));
    const s=renderPatternSVG(m),w=Number(s.match(/viewBox="0 0 ([\d.]+)/)[1]);
    assert.ok(w>=110);
    colors.forEach(color=>assert.ok(s.includes(`fill="${color}" stroke="${color}"`)));
    for(const match of s.matchAll(/<text x="([\d.-]+)" y="[\d.-]+" font-size="([\d.]+)" data-label="info">([^<]+)<\/text>/g)) {
      const x=Number(match[1]),size=Number(match[2]),text=match[3];
      // Conservative, font-independent bounds: wide CJK glyphs plus ASCII.
      const estimated=Array.from(text).reduce((sum,c)=>sum+(/[^\x00-\x7f]/.test(c)?1.08:.73),0)*size+.5;
      assert.ok(x>=0 && x+estimated < w,`${text}: ${x+estimated} > ${w}`);
    }
    for(const piece of [m.pieces[0],m.pieces[1]]) {
      const localX=piece.bounds.minX+1.1;
      const tx=7-piece.bounds.minX;
      assert.ok(tx+localX>0);
    }
  }
});

test('uniform mode preserves the original total and supplies three honest pattern segments', () => {
  const m=draft(),d=m.dimensions;
  assert.equal(m.valid,true);
  assert.equal(DEFAULTS.legElasticMode,'uniform');
  assert.deepEqual(d.legSegments.map(s=>s.id),['front','gusset','back']);
  d.legSegments.forEach(s=>{close(s.basisLength,s.patternLength);close(s.ratioPct,95);close(s.elasticLength,s.patternLength*.95);});
  close(d.legElasticNet,d.legOpening*.95);
  close(d.legElastic,d.legElasticNet+1.2);
  close(d.legElasticBasis,d.legOpening);
  close(d.legSegments[0].startMark,0);
  close(d.legSegments.at(-1).endMark,d.legElasticNet);
});

test('segmented percentages determine per-section lengths with joint allowance once per complete leg', () => {
  const m=draft({legElasticMode:'segmented',frontElasticPct:100,gussetElasticPct:97,backElasticPct:90,overlap:1.8}),d=m.dimensions;
  assert.equal(m.valid,true);
  const [front,gusset,back]=d.legSegments;
  close(front.elasticLength,d.frontLegArc);
  close(gusset.elasticLength,d.gussetSideArc*.97);
  close(back.elasticLength,d.backLegArc*.90);
  close(d.legElasticNet,front.elasticLength+gusset.elasticLength+back.elasticLength);
  close(d.legElastic,d.legElasticNet+1.8);
  close(d.legElasticTotal,2*d.legElastic);
  close(front.endMark,gusset.startMark);
  close(gusset.endMark,back.startMark);
  close(back.endMark,d.legElasticNet);
  assert.ok(m.warnings.some(w=>w.includes('不是固定推荐值')));
});

test('100 percent in every region produces fabric-edge lengths without hidden extra tightening', () => {
  const m=draft({legElasticMode:'segmented',frontElasticPct:100,gussetElasticPct:100,backElasticPct:100,overlap:0});
  assert.equal(m.valid,true);
  close(m.dimensions.legElasticNet,m.dimensions.legOpening);
  close(m.dimensions.legElastic,m.dimensions.legOpening);
});

test('three measured sections replace only elastic bases and do not change paper geometry', () => {
  const a=draft(),b=draft({legElasticMode:'segmented',frontLegOverride:20.12,gussetLegOverride:15.34,backLegOverride:23.56,frontElasticPct:100,gussetElasticPct:98,backElasticPct:92,overlap:1.2});
  assert.equal(b.valid,true,b.errors.join('; '));
  assert.deepEqual(b.pieces,a.pieces);
  close(b.dimensions.legOpening,a.dimensions.legOpening);
  assert.deepEqual(b.dimensions.legSegments.map(s=>s.basisLength),[20.12,15.34,23.56]);
  close(b.dimensions.legElasticBasis,20.12+15.34+23.56);
  close(b.dimensions.legElasticNet,20.12+15.34*.98+23.56*.92);
  assert.equal(b.dimensions.legElasticBasisSource,'segments-measured');
});

test('segmented mode ignores retained total override and never scales measured regions to it', () => {
  const input={legElasticMode:'segmented',frontLegOverride:20,gussetLegOverride:15,backLegOverride:25};
  const a=draft(input),b=draft({...input,legOpeningOverride:42});
  assert.equal(b.valid,true);
  assert.deepEqual(a.dimensions,b.dimensions);
  close(b.params.legOpeningOverride,42);
  assert.ok(b.warnings.some(w=>w.includes('分区模式不采用实测腿口总长')));
});

test('uniform measured total never invents a split or A/B marks', () => {
  const m=draft({legOpeningOverride:61.23,frontLegOverride:20,gussetLegOverride:15,backLegOverride:25,legElasticPct:94});
  assert.equal(m.valid,true);
  assert.deepEqual(m.dimensions.legSegments,[]);
  close(m.dimensions.legElasticNet,61.23*.94);
  close(m.dimensions.legElasticBasis,61.23);
  close(m.params.frontLegOverride,20);
  assert.ok(m.warnings.some(w=>w.includes('无法确定 A/B')));
  const s=renderPatternSVG(m);
  assert.match(s,/整圈模式不据总长推算 A\/B 定位/);
  assert.doesNotMatch(s,/先接好带，再沿净圈定位/);
});

test('uniform mode without a total override ignores but preserves retained region measurements', () => {
  const a=draft(),b=draft({frontLegOverride:5,gussetLegOverride:6,backLegOverride:7});
  assert.equal(b.valid,true);
  assert.deepEqual(a.dimensions,b.dimensions);
  close(b.params.frontLegOverride,5);
  close(b.dimensions.legElasticBasis,a.dimensions.legOpening);
});

test('region measurements are all-or-none and invalid modes or ratios reject', () => {
  for(const input of [{frontLegOverride:20},{frontLegOverride:20,gussetLegOverride:15},
    {legElasticMode:'segmented',frontLegOverride:20,gussetLegOverride:null,backLegOverride:25},
    {frontLegOverride:-1,gussetLegOverride:15,backLegOverride:25},{frontLegOverride:true,gussetLegOverride:15,backLegOverride:25},
    {frontLegOverride:20,gussetLegOverride:15,backLegOverride:NaN},
    {legElasticMode:'custom'},{frontElasticPct:101},{gussetElasticPct:49},{backElasticPct:Infinity},{legElasticPct:101}]) {
    const activeMode=('legElasticPct' in input) ? 'uniform' : 'segmented';
    const m=draft({legElasticMode:activeMode,...input}); assert.equal(m.valid,false,JSON.stringify(input)); assert.ok(m.errors.length);
  }
  assert.equal(draft({frontLegOverride:'',gussetLegOverride:'',backLegOverride:''}).valid,true);
});

test('switching to uniform ignores incomplete or invalid inactive segment inputs and preserves them raw', () => {
  const baseline=draft();
  for(const residual of [
    {frontLegOverride:'20',gussetLegOverride:'',backLegOverride:''},
    {frontLegOverride:'bad',gussetLegOverride:-4,backLegOverride:null},
    {frontElasticPct:'',gussetElasticPct:'bad',backElasticPct:101},
  ]) {
    const m=draft({legElasticMode:'uniform',...residual});
    assert.equal(m.valid,true,m.errors.join('; '));
    assert.deepEqual(m.dimensions,baseline.dimensions);
    for(const [key,value] of Object.entries(residual)) assert.equal(m.params[key],value);
    assert.ok(renderPatternSVG(m).includes('整圈均匀'));
  }
  const partial={frontLegOverride:'20',gussetLegOverride:'',backLegOverride:''};
  assert.equal(draft({legElasticMode:'segmented',...partial}).valid,false);
  assert.equal(draft({legElasticMode:'uniform',...partial}).valid,true);
});

test('switching to segmented ignores inactive uniform ratio and total override without coercing them', () => {
  const baseline=draft({legElasticMode:'segmented'});
  for(const residual of [
    {legElasticPct:'',legOpeningOverride:'bad'},
    {legElasticPct:'not-a-number',legOpeningOverride:-50},
    {legElasticPct:150,legOpeningOverride:Infinity},
  ]) {
    const m=draft({legElasticMode:'segmented',...residual});
    assert.equal(m.valid,true,m.errors.join('; '));
    assert.deepEqual(m.dimensions,baseline.dimensions);
    for(const [key,value] of Object.entries(residual)) assert.equal(m.params[key],value);
    assert.ok(Number.isFinite(m.dimensions.legElastic));
    assert.doesNotMatch(renderPatternSVG(m),/NaN|Infinity|not-a-number/);
  }
  assert.equal(draft({legElasticMode:'uniform',legElasticPct:''}).valid,false);
  assert.equal(draft({legElasticMode:'segmented',legElasticPct:''}).valid,true);
});

test('SVG explicitly distinguishes measured elastic bases from unchanged paper geometry', () => {
  const segmented=draft({legElasticMode:'segmented',frontLegOverride:20,gussetLegOverride:15,backLegOverride:25});
  const uniform=draft({legOpeningOverride:60});
  assert.match(renderPatternSVG(segmented),/腿带带长采用三段实测；实测未改变本图纸样/);
  assert.match(renderPatternSVG(uniform),/腿带带长采用整圈实测；实测未改变本图纸样/);
  assert.doesNotMatch(renderPatternSVG(draft()),/腿带带长采用(?:三段|整圈)实测/);
  assert.match(renderPatternSVG(draft({waistOpeningOverride:80})),/腰带带长采用整圈实测；实测未改变本图纸样/);
  for(const m of [segmented,uniform]) assert.deepEqual(m.pieces,draft().pieces);
});

test('changing joint allowance changes cutting length but never net marks or regional lengths', () => {
  const a=draft({legElasticMode:'segmented',overlap:0}),b=draft({legElasticMode:'segmented',overlap:2});
  assert.deepEqual(a.dimensions.legSegments,b.dimensions.legSegments);
  close(a.dimensions.legElasticNet,b.dimensions.legElasticNet);
  close(b.dimensions.legElastic-a.dimensions.legElastic,2);
  close(b.dimensions.legElasticTotal-a.dimensions.legElasticTotal,4);
});

test('download includes actual regional numbers, final marks, method and transverse stretch arrows', () => {
  const m=draft({legElasticMode:'segmented',frontLegOverride:20,gussetLegOverride:15,backLegOverride:25,frontElasticPct:100,gussetElasticPct:100,backElasticPct:90,finish:'turned',join:'overlap',overlap:.6});
  const s=renderPatternSVG(m);
  close(m.dimensions.legElasticNet,57.5);
  close(m.dimensions.legElastic,58.1);
  assert.match(s,/前片腿弯 20 × 100% = 20 cm/);
  assert.match(s,/裆侧边 15 × 100% = 15 cm/);
  assert.match(s,/后片腿弯 25 × 90% = 22.5 cm/);
  assert.match(s,/A 20 → 裆侧 → B 35 → 后片 → 侧缝 57.5 cm/);
  assert.match(s,/裁长 58.1 cm × 2/);
  assert.match(s,/收口：内折松紧带；接头：搭接/);
  assert.equal((s.match(/data-stretch="horizontal"/g)||[]).length,4);
  assert.match(renderPatternSVG(m,{finish:'foe',join:'sewn'}),/收口：对折包边松紧带（FOE）；接头：对缝/);
  const header=s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/),width=Number(header[1]),height=Number(header[2]);
  for(const match of s.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)" data-label="elastic-detail">([^<]+)<\/text>/g)) {
    const x=Number(match[1]),y=Number(match[2]),size=Number(match[3]),text=match[4];
    const estimated=Array.from(text).reduce((sum,c)=>sum+(/[^\x00-\x7f]/.test(c)?1.08:.73),0)*size+.5;
    assert.ok(x>=0 && x+estimated<width);
    assert.ok(y>0 && y+size<height-5);
  }
});
