/**
 * Parametric sample-cutting draft, centimetres throughout.
 * This is an explicit experimental construction, not a validated production block.
 * Curve lengths and cutting outlines are calculated from the same sampled geometry.
 */
export const DEFAULTS = Object.freeze({
  waist: 84, hip: 104, reductionPct: 4, rise: 'mid',
  frontLength: 18, backLength: 21, gussetLength: 17,
  gussetFront: 7, gussetBack: 9, sideSeam: 9,
  seamAllowance: 0.6, edgeAllowance: 0,
  waistElasticPct: 95, legElasticPct: 95, overlap: 1.2,
  legElasticMode: 'uniform', frontElasticPct: 100, gussetElasticPct: 100, backElasticPct: 95,
  waistOpeningOverride: null, legOpeningOverride: null,
  frontLegOverride: null, gussetLegOverride: null, backLegOverride: null,
  finish: 'foe', join: 'sewn',
});

const N = 96;
const EPS = 1e-8;
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lineLength = (pts) => pts.slice(1).reduce((s, p, i) => s + distance(pts[i], p), 0);
const mirrored = (pts) => pts.map(([x, y]) => [-x, y]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const round = (n, digits = 4) => Number(n.toFixed(digits));
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cubic(p0, p1, p2, p3) {
  return Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N, u = 1 - t;
    return [0, 1].map(axis => u ** 3 * p0[axis] + 3 * u ** 2 * t * p1[axis] + 3 * u * t ** 2 * p2[axis] + t ** 3 * p3[axis]);
  });
}

function bounds(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// Each edge has its own true normal-distance allowance. Intersect adjacent
// offset support lines; do not fake a cutting contour with thick SVG strokes.
function offsetPolygon(pts, allowances) {
  const corners = pts.map((p, i) => {
    const previous = (i + pts.length - 1) % pts.length;
    const a = pts[previous], b = pts[(i + 1) % pts.length];
    const u = subtract(p, a), v = subtract(b, p);
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    const d1 = allowances[previous], d2 = allowances[i];
    const q1 = [p[0] + u[1] / lu * d1, p[1] - u[0] / lu * d1];
    const q2 = [p[0] + v[1] / lv * d2, p[1] - v[0] / lv * d2];
    // Unequal allowances at a nearly tangent junction need a small bridge.
    // Intersecting their support lines would produce a long backwards spike.
    const cosine = (u[0] * v[0] + u[1] * v[1]) / (lu * lv);
    if (Math.abs(d1 - d2) > EPS && cosine > 0.90) return [q1, q2];
    const divisor = cross(u, v);
    if (Math.abs(divisor) < EPS) {
      if (Math.abs(d1 - d2) > EPS) throw new Error('相邻共线边的预留宽度不一致，请调整缝份。');
      return [[(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2]];
    }
    const t = cross(subtract(q2, q1), v) / divisor;
    const result = [q1[0] + t * u[0], q1[1] + t * u[1]];
    if (!result.every(Number.isFinite) || distance(p, result) > 8 * Math.max(d1, d2)) {
      throw new Error('此组尺寸产生过尖的裁剪转角，请增大相关宽度或减小缝份。');
    }
    return [result];
  });
  return { points: corners.flat(), cutEdges: corners.map((corner, i) => ({
    points: [corner.at(-1), corners[(i + 1) % corners.length][0]],
    sourceIndex: i, allowance: allowances[i],
  })) };
}

function hasIntersection(pts) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let j = i + 2; j < pts.length; j++) {
      if (i === 0 && j === pts.length - 1) continue;
      const c = pts[j], d = pts[(j + 1) % pts.length];
      const u = subtract(b, a), v = subtract(d, c), denominator = cross(u, v);
      if (Math.abs(denominator) < EPS) continue;
      const t = cross(subtract(c, a), v) / denominator;
      const s = cross(subtract(c, a), u) / denominator;
      if (t > EPS && t < 1 - EPS && s > EPS && s < 1 - EPS) return true;
    }
  }
  return false;
}

function finishPiece(id, name, seamPoints, roles, seams, p, annotations) {
  const allowances = roles.map(role => ['waist', 'leg'].includes(role) ? p.edgeAllowance : p.seamAllowance);
  const { points, cutEdges } = offsetPolygon(seamPoints, allowances);
  if (hasIntersection(seamPoints) || hasIntersection(points)) throw new Error(`${name}轮廓交叉，请调整尺寸或缝份后重新生成。`);
  const box = bounds(points);
  return { id, name, quantity: 1, seamPoints, points, cutEdges, edgeRoles: roles, edgeAllowances: allowances,
    bounds: box, width: box.width, height: box.height, seamBounds: bounds(seamPoints), seams, annotations };
}

function makeBody(id, waistWidth, hipWidth, length, joinWidth, p, joinHandle) {
  const waistHalf = waistWidth / 2, hipHalf = hipWidth / 2, joinHalf = joinWidth / 2;
  const sideDrop = Math.sqrt(p.sideSeam ** 2 - (hipHalf - waistHalf) ** 2);
  const depth = length - sideDrop;
  const legControls = [[hipHalf, sideDrop], [hipHalf * 0.82, sideDrop + depth * 0.36],
    [joinHalf + joinHandle.x, length - joinHandle.y], [joinHalf, length]];
  const legRight = cubic(...legControls);
  const waist = [[-waistHalf, 0], [waistHalf, 0]];
  const sideRight = [[waistHalf, 0], [hipHalf, sideDrop]];
  const join = [[joinHalf, length], [-joinHalf, length]];
  const pts = [waist[0]], roles = [];
  const add = (pt, role) => { roles.push(role); pts.push(pt); };
  add(waist[1], 'waist'); add(legRight[0], 'side');
  legRight.slice(1).forEach(pt => add(pt, 'leg'));
  add(join[1], 'join');
  mirrored(legRight).reverse().slice(1).forEach(pt => add(pt, 'leg'));
  roles.push('side');
  const seam = (points, label) => ({ points, length: lineLength(points), ...(label ? { label } : {}) });
  const seams = { waist: seam(waist), sideRight: seam(sideRight, 'C'), sideLeft: seam(mirrored(sideRight), 'C'),
    legRight: seam(legRight), legLeft: seam(mirrored(legRight)), gussetJoin: seam(join, id === 'front' ? 'A' : 'B') };
  seams.legRight.curve = { type: 'cubic-bezier', controlPoints: legControls };
  seams.legLeft.curve = { type: 'cubic-bezier', controlPoints: mirrored(legControls) };
  return finishPiece(id, id === 'front' ? '前片' : '后片', pts, roles, seams, p,
    { waistWidth, hipWidth, length, joinWidth, sideDrop, sideSeam: p.sideSeam });
}

function makeGusset(id, p, joinHandles) {
  const top = p.gussetFront / 2, bottom = p.gussetBack / 2;
  const legControls = [[top, 0], [top - joinHandles.front.x, joinHandles.front.y],
    [bottom - joinHandles.back.x, p.gussetLength - joinHandles.back.y], [bottom, p.gussetLength]];
  const legRight = cubic(...legControls);
  const pts = [[-top, 0]], roles = [];
  const add = (pt, role) => { roles.push(role); pts.push(pt); };
  add([top, 0], 'join');
  legRight.slice(1).forEach(pt => add(pt, 'leg'));
  add([-bottom, p.gussetLength], 'join');
  mirrored(legRight).reverse().slice(1, -1).forEach(pt => add(pt, 'leg'));
  roles.push('leg');
  const seam = (points, label) => ({ points, length: lineLength(points), ...(label ? { label } : {}) });
  const seams = { frontJoin: seam([[-top, 0], [top, 0]], 'A'), backJoin: seam([[-bottom, p.gussetLength], [bottom, p.gussetLength]], 'B'),
    legLeft: seam(mirrored(legRight)), legRight: seam(legRight) };
  seams.legRight.curve = { type: 'cubic-bezier', controlPoints: legControls };
  seams.legLeft.curve = { type: 'cubic-bezier', controlPoints: mirrored(legControls) };
  return finishPiece(id, id === 'gusset-outer' ? '裆外片' : '裆里片', pts, roles, seams, p,
    { length: p.gussetLength, frontWidth: p.gussetFront, backWidth: p.gussetBack });
}

/** @returns {{valid:boolean,errors:string[],warnings:string[],params:object,pieces:object[],dimensions:object}} */
export function draft(input = {}) {
  const p = { ...DEFAULTS, ...input }, errors = [], warnings = [];
  const segmented = p.legElasticMode === 'segmented';
  const ranges = {
    waist: [45, 180, '腰围'], hip: [60, 200, '臀围'], reductionPct: [0, 15, '纸样收紧比例'],
    frontLength: [10, 42, '前片中线长'], backLength: [12, 46, '后片中线长'],
    gussetLength: [8, 28, '裆片长'], gussetFront: [3, 14, '裆片前端宽'], gussetBack: [3, 18, '裆片后端宽'],
    sideSeam: [3, 26, '侧缝长'], seamAllowance: [0, 2.5, '接缝缝份'], edgeAllowance: [0, 2.5, '腰腿边预留'],
    waistElasticPct: [50, 115, '腰带比例'], overlap: [0, 5, '接头额外用量'],
    ...(segmented ? {
      frontElasticPct: [50, 100, '前段腿带比例'], gussetElasticPct: [50, 100, '裆段腿带比例'], backElasticPct: [50, 100, '后段腿带比例'],
    } : { legElasticPct: [50, 100, '腿带比例'] }),
  };
  for (const [key, [min, max, label]] of Object.entries(ranges)) {
    if (p[key] === '' || p[key] === null || typeof p[key] === 'boolean') { errors.push(`${label}需要填写数字。`); continue; }
    p[key] = Number(p[key]);
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max) errors.push(`${label}应在 ${min}—${max} 之间。`);
  }
  const activeOverrides = [['waistOpeningOverride', '实测腰口'], ...(segmented ? [
    ['frontLegOverride', '实测前片腿弯'], ['gussetLegOverride', '实测裆侧边'], ['backLegOverride', '实测后片腿弯'],
  ] : [['legOpeningOverride', '实测腿口']])];
  // Preserve disabled-mode inputs verbatim, including incomplete edits. They
  // are neither parsed nor validated until their mode becomes active again.
  for (const [key, label] of activeOverrides) {
    if (p[key] === '' || p[key] === null || p[key] === undefined) { p[key] = null; continue; }
    if (typeof p[key] === 'boolean') { errors.push(`${label}需要填写数字。`); continue; }
    p[key] = Number(p[key]);
    if (!Number.isFinite(p[key]) || p[key] <= 0 || p[key] > 220) errors.push(`${label}应大于 0 且不超过 220 cm。`);
  }
  if (!['mid', 'high'].includes(p.rise)) errors.push('腰高只支持中腰或高腰。');
  if (!['uniform', 'segmented'].includes(p.legElasticMode)) errors.push('腿带模式只支持整圈均匀或前裆后分区。');
  const segmentOverrideKeys = ['frontLegOverride', 'gussetLegOverride', 'backLegOverride'];
  const overrideCount = segmented ? segmentOverrideKeys.filter(key => p[key] !== null).length : 0;
  const hasRetainedSegments = segmentOverrideKeys.some(key => p[key] !== null && p[key] !== undefined && p[key] !== '');
  if (overrideCount !== 0 && overrideCount !== 3) errors.push('分区实测须同时填写前腿弯、裆侧边、后腿弯三段，或三段全部留空。');
  if (p.hip < p.waist) errors.push('本试裁模板要求臀围不小于腰围；其他体型需单独调整版型。');
  const result = { valid: false, errors, warnings, params: p, pieces: [], dimensions: {} };
  if (errors.length) return result;
  const reduction = 1 - p.reductionPct / 100;
  const waistOpening = p.waist * reduction, hipFinished = p.hip * reduction;
  const frontWaistWidth = waistOpening * 0.48, backWaistWidth = waistOpening * 0.52;
  const frontHipWidth = hipFinished * 0.48, backHipWidth = hipFinished * 0.52;
  for (const [name, w, h, length, join] of [
    ['前片', frontWaistWidth, frontHipWidth, p.frontLength, p.gussetFront],
    ['后片', backWaistWidth, backHipWidth, p.backLength, p.gussetBack],
  ]) {
    const dx = (h - w) / 2;
    if (p.sideSeam <= dx + 0.05) errors.push(`${name}侧缝过短，无法连接此腰臀差；请增加侧缝长或调整围度。`);
    else if (length <= Math.sqrt(p.sideSeam ** 2 - dx ** 2) + 2) errors.push(`${name}中线长需至少比侧缝垂直落差多 2 cm，才能形成腿弯。`);
    if (join >= h * 0.65) errors.push(`${name}裆端宽过大，需小于本片臀横宽的 65%。`);
  }
  if (errors.length) return result;
  // Shared endpoint handles make the assembled A/B curves C1 continuous.
  // The common handle is limited by BOTH body leg depth and gusset length,
  // so extreme inputs cannot place a control point past the opposite end.
  const inset = Math.min(p.gussetFront, p.gussetBack) * 0.35;
  const nominalHandleY = p.gussetLength * 0.36;
  const joinHandles = {};
  for (const [id, waistWidth, hipWidth, length, joinWidth] of [
    ['front', frontWaistWidth, frontHipWidth, p.frontLength, p.gussetFront],
    ['back', backWaistWidth, backHipWidth, p.backLength, p.gussetBack],
  ]) {
    const sideDrop = Math.sqrt(p.sideSeam ** 2 - ((hipWidth-waistWidth)/2) ** 2);
    const y = Math.min((length - sideDrop) * 0.48, nominalHandleY);
    joinHandles[id] = { x: (joinWidth/2-inset) * y/nominalHandleY, y };
  }
  let pieces;
  try {
    pieces = [makeBody('front', frontWaistWidth, frontHipWidth, p.frontLength, p.gussetFront, p, joinHandles.front),
      makeBody('back', backWaistWidth, backHipWidth, p.backLength, p.gussetBack, p, joinHandles.back),
      makeGusset('gusset-outer', p, joinHandles), makeGusset('gusset-lining', p, joinHandles)];
  } catch (error) { errors.push(error.message); return result; }
  const frontLegArc = pieces[0].seams.legRight.length, backLegArc = pieces[1].seams.legRight.length;
  const gussetSideArc = pieces[2].seams.legRight.length;
  const legOpening = frontLegArc + backLegArc + gussetSideArc;
  const waistElasticBasis = p.waistOpeningOverride ?? waistOpening;
  const waistElastic = waistElasticBasis * p.waistElasticPct / 100 + p.overlap;
  const measuredSegments = segmented && overrideCount === 3;
  const hasUniformOpeningOverride = !segmented && p.legOpeningOverride !== null;
  let cumulativeMark = 0;
  const legSegments = hasUniformOpeningOverride ? [] : [
    { id: 'front', name: '前片腿弯', patternLength: frontLegArc, override: p.frontLegOverride, ratio: p.frontElasticPct },
    { id: 'gusset', name: '裆侧边', patternLength: gussetSideArc, override: p.gussetLegOverride, ratio: p.gussetElasticPct },
    { id: 'back', name: '后片腿弯', patternLength: backLegArc, override: p.backLegOverride, ratio: p.backElasticPct },
  ].map(segment => {
    const basisLength = measuredSegments ? segment.override : segment.patternLength;
    const ratioPct = segmented ? segment.ratio : p.legElasticPct;
    const elasticLength = basisLength * ratioPct / 100;
    const startMark = cumulativeMark;
    cumulativeMark += elasticLength;
    return { id: segment.id, name: segment.name, patternLength: segment.patternLength, basisLength,
      ratioPct, elasticLength, startMark, endMark: cumulativeMark };
  });
  const legElasticBasis = hasUniformOpeningOverride ? p.legOpeningOverride : legSegments.reduce((sum, segment) => sum + segment.basisLength, 0);
  const legElasticNet = hasUniformOpeningOverride ? legElasticBasis * p.legElasticPct / 100 : cumulativeMark;
  const legElastic = legElasticNet + p.overlap;
  warnings.push('参数化试裁模板：未经真人试穿或特定面料验证，先用同类面料做样片。');
  warnings.push('围度收紧比例与松紧带比例分别调整；它们都不等于面料拉伸率。');
  warnings.push('中腰的输入腰围应取实际腰口位置；高腰应取目标高腰线围度。');
  warnings.push('默认采用对折松紧带包边（FOE）：腰腿边不另加预留，接缝缝份 0.6 cm；其他工艺需重新设置。');
  warnings.push('接头额外用量按每根计一次；默认对缝两端各 0.6 cm，共 1.2 cm，其他连接方式按实际工艺调整。');
  if (p.waistOpeningOverride !== null || hasUniformOpeningOverride) warnings.push('实测开口只用于松紧带裁长，纸样几何仍由围度与版型参数生成。');
  if (segmented) warnings.push('前 100%／裆 100%／后 95% 仅为分区计算演示，不是固定推荐值；需用实际松紧带试绕校正。');
  if (segmented && p.legOpeningOverride !== null && p.legOpeningOverride !== undefined && p.legOpeningOverride !== '') warnings.push('分区模式不采用实测腿口总长；请提供三段实测，或用纸样三段弧长计算。');
  if (!segmented && hasRetainedSegments) warnings.push('整圈均匀模式保留分段实测输入但不采用；当前使用整圈实测或纸样总弧长。');
  if (hasUniformOpeningOverride) warnings.push('整圈实测总长无法确定 A/B 分区标记；分区计算应采用前腿弯、裆侧边、后腿弯三段实测。');
  if (measuredSegments) warnings.push('三段实测应在已合侧缝、尚未装松紧时沿不拉伸的布边测量；实测值只影响带长，不改纸样。');
  if (p.waistElasticPct > 100) warnings.push('腰松紧带比例超过 100%，可能无法贴合，需核对工艺与试样。');
  const dimensions = { waistOpening, hipFinished, legOpening, waistElastic, legElastic, legElasticNet, legSegments,
    legElasticMode: p.legElasticMode, legElasticBasisSource: measuredSegments ? 'segments-measured' : hasUniformOpeningOverride ? 'opening-measured' : 'pattern',
    waistElasticTotal: waistElastic, legElasticTotal: legElastic * 2, allElasticTotal: waistElastic + legElastic * 2,
    waistElasticBasis, legElasticBasis, frontWaistWidth, backWaistWidth, frontHipWidth, backHipWidth,
    frontLength: p.frontLength, backLength: p.backLength, sideSeam: p.sideSeam,
    gussetLength: p.gussetLength, gussetFront: p.gussetFront, gussetBack: p.gussetBack,
    frontLegArc, backLegArc, gussetSideArc, allowance: p.seamAllowance, edgeAllowance: p.edgeAllowance,
    frontSideDrop: pieces[0].annotations.sideDrop, backSideDrop: pieces[1].annotations.sideDrop,
    crotchPathLength: p.frontLength + p.gussetLength + p.backLength,
    seamMatches: { sideLeft: true, sideRight: true, gussetFront: true, gussetBack: true },
  };
  return { ...result, valid: true, pieces, dimensions };
}

const polyPath = (pts) => `M${pts.map(([x, y]) => `${round(x)},${round(y)}`).join('L')}Z`;
const fmt = n => Number(n.toFixed(1)).toString();
const PIECE_COLORS = Object.freeze({ front: '#b47f9c', back: '#8c719f', 'gusset-outer': '#759c98', 'gusset-lining': '#dfbf81' });
// Conservative width in SVG centimetres, including a small bearing allowance.
// It reserves enough room even without a font-measurement API in Node.
const textWidth = (value, size) => Array.from(String(value)).reduce((sum, c) => sum + (/[^\x00-\x7f]/.test(c) ? 1.08 : 0.73), 0) * size + 0.5;

/** Full-size, unpaginated SVG. width/height are millimetres; viewBox units are cm. */
export function renderPatternSVG(model, options = {}) {
  if (!model || !model.valid) return '';
  const { showDimensions = true, showAllowance = true, showGrain = true } = options;
  const [front, back, outer, lining] = model.pieces, p = model.params, d = model.dimensions;
  const margin = 7, gap = 14, titleHeight = 12;
  const row1Height = Math.max(front.height, back.height);
  const row2Y = titleHeight + row1Height + 17;
  const infoX = Math.max(62, margin + outer.width + lining.width + 30), infoY = row2Y + 1;
  const infoRows = [
    { x: infoX + 14, y: infoY + 3, value: `腰带：${fmt(d.waistElastic)} cm × 1`, size: 1.2 },
    { x: infoX + 14, y: infoY + 5.4, value: `腿带：${fmt(d.legElastic)} cm × 2`, size: 1.2 },
    { x: infoX + 14, y: infoY + 7.8, value: `每根接头额外用量 ${fmt(p.overlap)} cm`, size: 1.03 },
    { x: infoX, y: infoY + 15, value: `接缝缝份 ${fmt(p.seamAllowance)} cm · 腰腿边预留 ${fmt(p.edgeAllowance)} cm`, size: 1.06 },
    { x: infoX, y: infoY + 17.2, value: '实线＝裁剪线；虚线＝净样缝线', size: 1.06 },
    { x: infoX, y: infoY + 19.4, value: 'A 接前裆 / B 接后裆 / C 接左右侧缝', size: 1.06 },
  ];
  const finishLabels = { foe: '对折包边松紧带（FOE）', turned: '内折松紧带' };
  const joinLabels = { sewn: '对缝', overlap: '搭接', custom: '自定义接头' };
  const finish = finishLabels[options.finish ?? p.finish] ?? '自定义收口';
  const join = joinLabels[options.join ?? p.join] ?? '自定义接头';
  const segments = d.legSegments;
  const modeLabel = p.legElasticMode === 'segmented' ? '前／裆／后分区' : '整圈均匀';
  const bottomValues = [
    `收口：${finish}；接头：${join}；每根接头额外用量 ${fmt(p.overlap)} cm。腿带：${modeLabel}，净圈 ${fmt(d.legElasticNet)} cm，裁长 ${fmt(d.legElastic)} cm × 2。`,
    segments.length ? `每条分段净带长：${segments.map(segment => `${segment.name} ${fmt(segment.basisLength)} × ${fmt(segment.ratioPct)}% = ${fmt(segment.elasticLength)} cm`).join('；')}。`
      : `当前采用实测腿口总长 ${fmt(d.legElasticBasis)} cm × ${fmt(p.legElasticPct)}%；整圈模式不据总长推算 A/B 定位。`,
    segments.length ? `先接好带，再沿净圈定位：侧缝 0 → 前片 → A ${fmt(segments[0].endMark)} → 裆侧 → B ${fmt(segments[1].endMark)} → 后片 → 侧缝 ${fmt(d.legElasticNet)} cm。定位不含接头。`
      : '如需前松后紧，请在已合侧缝、尚未装松紧时，分别测前腿弯、裆侧边、后腿弯；布边保持不拉伸。',
    p.legElasticMode === 'segmented' ? '前 100%／裆 100%／后 95% 仅演示分区计算，不是推荐比例；各段张力须按实际弹力带试绕、试穿调整。'
      : '整圈均匀比例只作试样起点；如需分区张力，可在网页切换前／裆／后分区模式并逐段调整。',
  ];
  if (d.legElasticBasisSource === 'segments-measured' || d.legElasticBasisSource === 'opening-measured') {
    bottomValues.push(`腿带带长采用${d.legElasticBasisSource === 'segments-measured' ? '三段实测' : '整圈实测'}；实测未改变本图纸样。请核对实测样裤与本图纸样是否一致，勿将带长视为已重制纸样的配套值。`);
  }
  if (p.waistOpeningOverride !== null) bottomValues.push('腰带带长采用整圈实测；实测未改变本图纸样。请核对实测腰口与本图纸样是否一致。');
  const bottomY = row2Y + Math.max(outer.height, lining.height, 16) + 13;
  const bottomRows = bottomValues.map((value, i) => ({ x: margin, y: bottomY + i * 2.6, value, size: 1.08 }));
  const width = Math.max(front.width + back.width + gap + margin * 2 + 3, 110,
    ...[...infoRows, ...bottomRows].map(row => row.x + textWidth(row.value, row.size) + margin));
  const height = bottomY + bottomRows.length * 2.6 + 7;
  const layout = [
    { piece: front, x: margin, y: titleHeight },
    { piece: back, x: margin + front.width + gap, y: titleHeight },
    { piece: outer, x: margin, y: row2Y },
    { piece: lining, x: margin + outer.width + 15, y: row2Y },
  ];
  const text = (x, y, value, size = 1.15, extra = '') => `<text x="${round(x)}" y="${round(y)}" font-size="${size}" ${extra}>${escape(value)}</text>`;
  const line = (x1, y1, x2, y2, extra = '') => `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" ${extra}/>`;
  const horizontalDim = (x1, x2, y, label) => `<g class="dimension">${line(x1,y,x2,y,'marker-start="url(#dimArrow)" marker-end="url(#dimArrow)"')}${line(x1,y-.6,x1,y+.6)}${line(x2,y-.6,x2,y+.6)}${text((x1+x2)/2,y-.7,label,1.08,'text-anchor="middle"')}</g>`;
  const verticalDim = (x, y1, y2, label) => `<g class="dimension">${line(x,y1,x,y2,'marker-start="url(#dimArrow)" marker-end="url(#dimArrow)"')}${line(x-.6,y1,x+.6,y1)}${line(x-.6,y2,x+.6,y2)}${text(x+.8,(y1+y2)/2,label,1.03)}</g>`;
  const groups = layout.map(({ piece, x, y }) => {
    const tx = x - piece.bounds.minX, ty = y - piece.bounds.minY, a = piece.annotations;
    const color = PIECE_COLORS[piece.id];
    let content = `<path class="cut" fill="${color}" stroke="${color}" d="${polyPath(showAllowance ? piece.points : piece.seamPoints)}"/>`;
    if (showAllowance) content += `<path class="seam" d="${polyPath(piece.seamPoints)}"/>`;
    if (showGrain) {
      const y1 = 2.8, y2 = a.length - 2.8;
      content += line(0,y1,0,y2,'class="grain" marker-start="url(#grainArrow)" marker-end="url(#grainArrow)"');
      content += text(.7,(y1+y2)/2,'纱向',.95);
    }
    content += line(0,-.1,0,a.length+.1,'class="centre"');
    content += text(0,piece.bounds.maxY+3,`${piece.name} · 裁 1 片`,1.6,'text-anchor="middle" class="piece-title"');
    content += text(0,piece.bounds.maxY+4.8,piece.id==='gusset-lining'?'亲肤棉里料；净样同裆外片':'整片纸样 · 左右对称',1.03,'text-anchor="middle"');
    const stretchHalf = Math.max(2.8, Math.min(9, piece.width * .3));
    content += line(-stretchHalf,piece.bounds.maxY+7,stretchHalf,piece.bounds.maxY+7,'class="grain" data-stretch="horizontal" marker-start="url(#grainArrow)" marker-end="url(#grainArrow)"');
    content += text(0,piece.bounds.maxY+8.8,'横向最大弹力',1.03,'text-anchor="middle"');
    if (piece.id === 'front' || piece.id === 'back') {
      content += text(0,a.length-1.2,`${piece.seams.gussetJoin.label} · 接裆片`,1.03,'text-anchor="middle"');
      content += text(-a.hipWidth/2+1.7,a.sideDrop/2,'C',1.2) + text(a.hipWidth/2-1.7,a.sideDrop/2,'C',1.2,'text-anchor="end"');
      if (showDimensions) {
        content += horizontalDim(-a.waistWidth/2,a.waistWidth/2,-2.8,`腰口净宽 ${fmt(a.waistWidth)} cm`);
        content += horizontalDim(-a.hipWidth/2,a.hipWidth/2,a.sideDrop+1.7,`臀横净宽 ${fmt(a.hipWidth)} cm`);
        content += horizontalDim(-a.joinWidth/2,a.joinWidth/2,a.length+1.35,`${fmt(a.joinWidth)} cm`);
        content += verticalDim(piece.bounds.maxX+2.4,0,a.length,`${fmt(a.length)} cm`);
        content += text(piece.bounds.minX+1.1,a.sideDrop/2+1.8,`侧缝 ${fmt(p.sideSeam)} cm`,1.02,'data-label="side-length"');
      }
    } else {
      content += text(0,1.7,'A · 接前片',1.03,'text-anchor="middle"');
      content += text(0,a.length-1,'B · 接后片',1.03,'text-anchor="middle"');
      if (showDimensions) {
        content += horizontalDim(-a.frontWidth/2,a.frontWidth/2,-2.8,`前端 ${fmt(a.frontWidth)} cm`);
        content += horizontalDim(-a.backWidth/2,a.backWidth/2,a.length+1.35,`后端 ${fmt(a.backWidth)} cm`);
        content += verticalDim(piece.bounds.maxX+2.2,0,a.length,`${fmt(a.length)} cm`);
      }
    }
    return `<g data-piece="${piece.id}" transform="translate(${round(tx)} ${round(ty)})">${content}</g>`;
  }).join('');
  const info = `${text(infoX,infoY,'10 × 10 cm 校准框',1.25)}<rect x="${infoX}" y="${infoY+2}" width="10" height="10" fill="none" stroke="#253f3c" stroke-width=".06"/>`
    + infoRows.map(row => text(row.x,row.y,row.value,row.size,'data-label="info"')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width*10)}mm" height="${round(height*10)}mm" viewBox="0 0 ${round(width)} ${round(height)}" role="img" aria-label="女士三角内裤四片试裁纸样，包含尺寸与十厘米校准框">
<title>女士三角内裤 · ${p.rise==='high'?'高腰':'中腰'} · 参数化试裁纸样</title>
<desc>单位厘米；整片输出，无需对折裁剪。以百分之百实际尺寸打印，量取校准框确认比例。未经真人试穿验证。</desc>
<defs><marker id="dimArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M10 1L0 5L10 9" fill="none" stroke="#64716c" stroke-width="1.3"/></marker><marker id="grainArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M10 1L0 5L10 9" fill="none" stroke="#778379" stroke-width="1.3"/></marker></defs>
<style>text{font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;fill:#293f3a}.cut{fill-opacity:.13;stroke-width:.105;stroke-linejoin:round}.seam{fill:none;stroke:#65545d;stroke-width:.065;stroke-dasharray:.48 .32}.dimension{stroke:#64716c;stroke-width:.045}.dimension text{stroke:none;fill:#56675f}.grain{stroke:#778379;stroke-width:.055}.centre{stroke:#a5aaa0;stroke-width:.035;stroke-dasharray:.15 .35}.piece-title{font-weight:600}</style>
<rect width="100%" height="100%" fill="#fffef9"/>
${text(margin,3.8,'女士三角内裤 · 参数化试裁纸样',2.1,'font-weight="600"')}
${text(margin,6.2,`${p.rise==='high'?'高腰':'中腰'} | 腰口位置围度 ${fmt(p.waist)} cm · 臀围 ${fmt(p.hip)} cm · 试样收紧 ${fmt(p.reductionPct)}%`,1.17)}
${groups}${info}
${bottomRows.map(row => text(row.x,row.y,row.value,row.size,'data-label="elastic-detail"')).join('')}
${text(margin,height-4.7,'以 100% 实际尺寸输出；此图为大幅原图，请使用绘图仪或打印工具分页，勿“适应页面”。',1.13)}
${text(margin,height-2.3,'先量校准框，再裁试样。比例与缝份须结合布料及松紧带试穿调整；本图不是经过验证的生产版。',1.13)}
</svg>`;
}
