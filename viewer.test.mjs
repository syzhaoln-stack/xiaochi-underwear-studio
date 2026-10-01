import test from 'node:test';
import assert from 'node:assert/strict';
import { GarmentViewer } from './viewer.js';
import { draft } from './pattern.js';

// Exercise the production model-update and geometry methods without constructing
// WebGL, a canvas, the DOM, or a network-loaded mannequin. No geometry helper is
// mocked and no seam-angle formula is reproduced in this test.
function geometryViewer(params) {
  const viewer = Object.create(GarmentViewer.prototype);
  const statuses = [];
  viewer.onStatus = status => statuses.push(status);
  for (const method of ['buildWear', 'buildFlat', 'updateBody', 'applyVisibility', 'selectPiece']) viewer[method] = () => {};
  const model = draft(params);
  assert.equal(model.valid, true, model.errors.join('; '));
  viewer.update(model);
  assert.deepEqual(statuses, [], 'real update() must complete without a swallowed geometry error');
  assert.equal(viewer.model, model);
  assert.equal(viewer.updateSeamAngles, GarmentViewer.prototype.updateSeamAngles);
  assert.equal(viewer.pointOnPanel, GarmentViewer.prototype.pointOnPanel);
  assert.equal(viewer.originalSurface, GarmentViewer.prototype.originalSurface);
  return viewer;
}

function closePoint(actual, expected, context, tolerance = 1e-12) {
  assert.equal(actual.length, 3, context);
  assert.ok(actual.every(Number.isFinite), `${context}: coordinates must be finite`);
  const error = Math.hypot(...actual.map((value, axis) => value - expected[axis]));
  assert.ok(error <= tolerance, `${context}: geometric gap ${error} m exceeds ${tolerance} m`);
}

const sizes = [
  { label: 'XL', waist: 80, hip: 100 },
  { label: 'XXL', waist: 84, hip: 104 },
];
const rises = [
  { label: 'mid', rise: 'mid', frontLength: 18, backLength: 21, sideSeam: 9 },
  { label: 'high', rise: 'high', frontLength: 26, backLength: 29, sideSeam: 17 },
];

for (const size of sizes) for (const rise of rises) {
  const params = { waist: size.waist, hip: size.hip, rise: rise.rise,
    frontLength: rise.frontLength, backLength: rise.backLength, sideSeam: rise.sideSeam };
  const name = `${size.label} ${rise.label}`;

  test(`${name}: left and right C seams close at every sampled row for shifts 0, 3 and 6 cm`, () => {
    for (const seamShift of [0, 3, 6]) {
      const viewer = geometryViewer({ ...params, seamShift });
      for (let row = 0; row <= 64; row++) for (const side of [0, 1]) {
        const v = row / 64;
        const front = viewer.pointOnPanel('front', side, v);
        const back = viewer.pointOnPanel('back', side, v);
        closePoint(front, back, `${name}, shift ${seamShift}, side ${side}, row ${row}`);
      }
    }
  });

  test(`${name}: moved back-panel ends wrap into the front half and zero remains on the original side`, () => {
    const original = geometryViewer({ ...params, seamShift: 0 });
    const shift3 = geometryViewer({ ...params, seamShift: 3 });
    const shift6 = geometryViewer({ ...params, seamShift: 6 });
    for (let row = 0; row <= 40; row++) for (const side of [0, 1]) {
      const v = row / 40;
      const originalPoint = original.pointOnPanel('back', side, v);
      const point3 = shift3.pointOnPanel('back', side, v);
      const point6 = shift6.pointOnPanel('back', side, v);
      assert.ok(Math.abs(originalPoint[2]) < 1e-12, `${name}, row ${row}: shift 0 must remain in the side plane`);
      assert.ok(point3[2] > 1e-9, `${name}, row ${row}: shifted back edge must actually extend to front Z > 0`);
      assert.ok(point6[2] > point3[2], `${name}, row ${row}: 6 cm must extend farther forward than 3 cm`);
      assert.ok(side === 0 ? point3[0] < 0 && point6[0] < 0 : point3[0] > 0 && point6[0] > 0,
        `${name}, row ${row}: shifting must not exchange left and right`);
    }
  });

  test(`${name}: moving panel ownership leaves the original full outer surface unchanged`, () => {
    const baseline = geometryViewer({ ...params, seamShift: 0 });
    const viewers = [3, 6].map(seamShift => geometryViewer({ ...params, seamShift }));
    // Test both opening boundaries and interior rings around the full 360 degrees.
    for (const v of [0, .25, .5, .75, 1]) for (let column = 0; column <= 96; column++) {
      const theta = column / 96 * Math.PI * 2;
      const expected = baseline.originalSurface(theta, v);
      viewers.forEach(viewer => closePoint(viewer.originalSurface(theta, v), expected,
        `${name}, shift ${viewer.params.seamShift}, v ${v}, angle sample ${column}`));
    }
  });
}

test('reusing one viewer recomputes boundaries when moving 0 → 6 → 3 → 0', () => {
  const viewer = geometryViewer({ seamShift: 0 });
  const reference = [0, .25, .5, .75, 1].map(v => viewer.pointOnPanel('back', 1, v));
  const errors = [];
  viewer.onStatus = value => errors.push(value);
  for (const seamShift of [6, 3, 0]) {
    viewer.update(draft({ seamShift }));
    assert.deepEqual(errors, []);
    for (const [i, v] of [0, .25, .5, .75, 1].entries()) {
      const front = viewer.pointOnPanel('front', 1, v), back = viewer.pointOnPanel('back', 1, v);
      closePoint(front, back, `reused viewer, shift ${seamShift}, row ${i}`);
      if (seamShift === 0) closePoint(back, reference[i], `reused viewer returns to original seam, row ${i}`);
      else assert.ok(back[2] > 1e-9);
    }
  }
});
