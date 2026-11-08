// node --test .claude/skills/eurostat-extract/scripts/jsonstat.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availability, buildSeries, mergeSeries, openCube, periodEnd, symmetricPercent } from './jsonstat.mjs';

/** unit × geo × time. Cells absent from `value` are missing observations. */
const fixture = (value, extra = {}) => ({
  class: 'dataset',
  label: 'Test data',
  id: ['unit', 'geo', 'time'],
  size: [3, 3, 4],
  dimension: {
    unit: { label: 'Unit', category: { index: { MIO_EUR: 0, MIO_NAC: 1, PC_GDP: 2 } } },
    geo: { label: 'Geo', category: { index: ['BG', 'PL', 'RO'] } },
    time: { label: 'Time', category: { index: { 2020: 0, 2021: 1, 2022: 2, 2023: 3 } } },
  },
  extension: { id: 'TEST$DEFAULTVIEW', datastructure: { id: 'TEST' } },
  value,
  ...extra,
});

const at = (unit, geo, time) => unit * 12 + geo * 4 + time;
const EUR = 0;
const NAC = 1;
const PC = 2;
const [BG, PL] = [0, 1];

/** A translation for every code in a fixture, so tests pick only what they exercise. */
const labelsFor = (ds) => ({
  datasets: { TEST: 'Тестови данни' },
  dimensions: Object.fromEntries(
    ds.id.map((dim) => {
      const index = ds.dimension[dim].category.index;
      const codes = Array.isArray(index) ? index : Object.keys(index);
      return [dim, Object.fromEntries(codes.map((code) => [code, `${code}-bg`]))];
    }),
  ),
});

const text = (key) => `${key}-описание`;

/** Code-level text everywhere except geo, which is described once as a dimension. */
const descriptionsFor = (ds) => ({
  dimensions: { geo: text('geo') },
  codes: Object.fromEntries(
    ds.id
      .filter((dim) => dim !== 'geo')
      .map((dim) => {
        const index = ds.dimension[dim].category.index;
        const codes = Array.isArray(index) ? index : Object.keys(index);
        return [dim, Object.fromEntries(codes.map((code) => [code, text(code)]))];
      }),
  ),
});

const build = (ds, select, extra = {}) =>
  buildSeries(openCube(ds), { select, id: 'x', name: 'X', labels: labelsFor(ds), descriptions: descriptionsFor(ds), ...extra });

test('takes every period present and scales millions to base units', () => {
  const ds = fixture({ [at(EUR, BG, 0)]: 100, [at(EUR, BG, 1)]: 150.5, [at(EUR, BG, 2)]: -50, [at(EUR, BG, 3)]: 0 });
  const { series, report } = build(ds, { unit: 'MIO_EUR', geo: 'BG' });
  assert.equal(series.unit, 'EUR');
  assert.deepEqual(series.data.map((p) => p.date), ['2020-12-31', '2021-12-31', '2022-12-31', '2023-12-31']);
  assert.equal(series.data[1].value, 150500000);
  assert.deepEqual(series.data[0], { date: '2020-12-31', value: 100000000, change: 0, change_percent: 0 });
  assert.equal(series.data[2].change_percent, -200);
  assert.equal(report.periods, 4);
});

test('reads the same whether value is an object or an array', () => {
  const array = new Array(36).fill(null);
  array[at(PC, BG, 2)] = -3.8;
  const object = { [at(PC, BG, 2)]: -3.8 };
  const select = { unit: 'PC_GDP', geo: 'BG' };
  assert.deepEqual(build(fixture(array), select).series.data, build(fixture(object), select).series.data);
});

test('percent units stay unscaled and leave no float noise in change', () => {
  const ds = fixture({ [at(PC, BG, 0)]: 2.2, [at(PC, BG, 1)]: -3.8 });
  const { series } = build(ds, { unit: 'PC_GDP', geo: 'BG' });
  assert.equal(series.unit, 'percent');
  assert.equal(series.data[1].value, -3.8);
  assert.equal(series.data[1].change, -6);
});

test('a change between decimals carries no rounding noise', () => {
  const ds = fixture({ [at(PC, BG, 0)]: 38.4, [at(PC, BG, 1)]: 37.7 });
  assert.equal(build(ds, { unit: 'PC_GDP', geo: 'BG' }).series.data[1].change, -0.7);
});

test('a row after a gap is not compared across it', () => {
  const ds = fixture({ [at(EUR, BG, 0)]: 10, [at(EUR, BG, 2)]: 30, [at(EUR, BG, 3)]: 40 });
  const { series, report } = build(ds, { unit: 'MIO_EUR', geo: 'BG' });
  assert.deepEqual(report.gaps, ['2021']);
  assert.equal(series.data[1].change, 0);
  assert.equal(series.data[2].change, 10000000);
});

test('refuses to select time, and refuses an open dimension', () => {
  const ds = fixture({ [at(EUR, BG, 0)]: 1 });
  assert.throws(() => build(ds, { unit: 'MIO_EUR', geo: 'BG', time: '2020' }), /every year/);
  assert.throws(() => build(ds, { unit: 'MIO_EUR' }), /Still open: geo/);
  assert.throws(() => build(ds, { unit: 'MIO_EUR', geo: 'XX' }), /Unknown geo code/);
  assert.throws(() => build(ds, { unit: 'MIO_EUR', geo: 'RO' }), /No data/);
});

test('MIO_NAC is read against its euro sibling, not assumed to be euro', () => {
  const values = {
    [at(EUR, BG, 3)]: 100, [at(NAC, BG, 3)]: 100,
    [at(EUR, PL, 3)]: 100, [at(NAC, PL, 3)]: 450,
  };
  assert.equal(build(fixture(values), { unit: 'MIO_NAC', geo: 'BG' }).series.unit, 'EUR');
  assert.throws(() => build(fixture(values), { unit: 'MIO_NAC', geo: 'PL' }), /not in euro/);
});

test('an unmapped unit needs an explicit override', () => {
  const ds = fixture({ [at(EUR, BG, 0)]: 1 });
  ds.dimension.unit.category.index = { CP_MEUR: 0, MIO_NAC: 1, PC_GDP: 2 };
  assert.throws(() => build(ds, { unit: 'CP_MEUR', geo: 'BG' }), /no automatic mapping/);
  const { series } = build(ds, { unit: 'CP_MEUR', geo: 'BG' }, { chartUnit: 'EUR', scale: 1e6 });
  assert.equal(series.data[0].value, 1000000);
});

test('symmetric percent matches charts.json and survives zero', () => {
  assert.equal(symmetricPercent(288e6, 356e6), 21.12);
  assert.equal(symmetricPercent(356e6, 38e6), -161.42);
  assert.equal(symmetricPercent(-14e6, 736e6), 200);
  assert.equal(symmetricPercent(0, 0), 0);
});

test('period ends', () => {
  assert.equal(periodEnd('2024'), '2024-12-31');
  assert.equal(periodEnd('2024-Q1'), '2024-03-31');
  assert.equal(periodEnd('2024-02'), '2024-02-29');
  assert.throws(() => periodEnd('2024-S1'), /Unsupported/);
});

test('flags a default-view export and strips its suffix from the source link', () => {
  const annotation = [{ type: 'DISSEMINATION_EXTRACTION_TYPE', title: 'DEFAULT_VIEW' }];
  const ds = fixture({ [at(EUR, BG, 0)]: 1 }, { extension: { id: 'TEST$DEFAULTVIEW', annotation } });
  const { series, report } = build(ds, { unit: 'MIO_EUR', geo: 'BG' });
  assert.equal(report.defaultView, true);
  assert.match(series.sources[0].url[0], /view\/TEST\/default/);
  assert.equal(series.sources[0].dataset_id, 'TEST');
  assert.match(series.sources[0].name.en, /\(Eurostat, euro\)$/);
  assert.match(series.sources[0].name.bg, /\(Евростат, евро\)$/);
});

test('reports flags and groups units sharing a coverage', () => {
  const ds = fixture(
    { [at(EUR, BG, 0)]: 1, [at(EUR, BG, 1)]: 2, [at(NAC, BG, 0)]: 1, [at(NAC, BG, 1)]: 2, [at(PC, BG, 1)]: 3 },
    { status: { [at(PC, BG, 1)]: 'b' } },
  );
  const rows = availability(openCube(ds), { geo: 'BG' });
  assert.deepEqual(rows.map((r) => [r.units, r.span, r.flags]), [
    [['MIO_EUR', 'MIO_NAC'], '2020–2021 (2)', ''],
    [['PC_GDP'], '2021 (1)', 'b×1'],
  ]);
  assert.deepEqual(build(ds, { unit: 'PC_GDP', geo: 'BG' }).report.flags, ['2021:b']);
});

test('a selection split by coverage stays together in the menu', () => {
  const ds = fixture({
    [at(EUR, BG, 1)]: 1,
    [at(EUR, PL, 0)]: 1,
    [at(NAC, BG, 0)]: 1,
    [at(NAC, BG, 1)]: 1,
  });
  const rows = availability(openCube(ds), { unit: 'MIO_EUR' }).length;
  assert.equal(rows, 2);
  const byTime = availability(openCube(ds), {});
  assert.deepEqual(byTime.map((r) => r.selection.geo), ['BG', 'BG', 'PL']);
});

test('merge adds a new id and leaves other entries alone', () => {
  const other = { id: 'a', name: 'A', unit: 'EUR', data: [] };
  const { charts, action } = mergeSeries([other], { id: 'b', name: 'B', sources: [], unit: 'EUR', data: [] });
  assert.equal(action, 'added');
  assert.equal(charts[0], other);
  assert.equal(charts.length, 2);
});

test('merge replaces by id, keeping hand-written fields and sources in place', () => {
  const nsi = { name: 'НСИ', url: ['https://nsi.bg'] };
  const old = {
    id: 'x', name: 'Old', shortName: 'O', meta: { style: {} }, sources: [nsi], unit: 'percent',
    data: [{ date: '2020-12-31', value: 1 }, { date: '2021-12-31', value: 2 }],
  };
  const next = {
    id: 'x', name: 'New', sources: [{ name: 'E', url: ['https://eurostat'] }], unit: 'EUR',
    data: [{ date: '2021-12-31', value: 3 }, { date: '2022-12-31', value: 4 }],
  };
  const keep = { id: 'k', data: [] };
  const { charts, action, diff } = mergeSeries([old, keep], next);
  assert.equal(action, 'replaced');
  assert.equal(charts[1], keep);
  assert.equal(charts[0].shortName, 'O');
  assert.deepEqual(charts[0].meta, { style: {} });
  assert.equal(charts[0].name, 'New');
  assert.deepEqual(charts[0].sources.map((s) => s.name), ['НСИ', 'E']);
  assert.deepEqual(diff, { unit: 'percent → EUR', dataset: null, added: ['2022-12-31'], removed: ['2020-12-31'], changed: ['2021-12-31'] });
});

test('keeps every selected option, including the ones with a single code', () => {
  const ds = fixture({ [at(EUR, BG, 0)]: 1 }, { updated: '2026-10-21' });
  ds.id = ['freq', ...ds.id];
  ds.size = [1, ...ds.size];
  ds.dimension.freq = { category: { index: { A: 0 }, label: { A: 'Annual' } } };
  ds.dimension.unit.category.label = { MIO_EUR: 'Million euro' };
  const { dataset } = build(ds, { unit: 'MIO_EUR', geo: 'BG' }).series;
  assert.deepEqual(dataset, {
    id: 'TEST',
    label: { en: 'Test data', bg: 'Тестови данни' },
    updated: '2026-10-21',
    selection: {
      freq: { code: 'A', label: { en: 'Annual', bg: 'A-bg' }, description: text('A') },
      unit: { code: 'MIO_EUR', label: { en: 'Million euro', bg: 'MIO_EUR-bg' }, description: text('MIO_EUR') },
      geo: { code: 'BG', label: { en: 'BG', bg: 'BG-bg' }, description: text('geo') },
    },
  });
});

test('stops and names every missing label and description', () => {
  const ds = fixture({ [at(EUR, BG, 0)]: 1 });
  const labels = labelsFor(ds);
  const descriptions = descriptionsFor(ds);
  delete labels.datasets.TEST;
  delete labels.dimensions.geo.BG;
  delete descriptions.codes.unit.MIO_EUR;
  assert.throws(
    () => build(ds, { unit: 'MIO_EUR', geo: 'BG' }, { labels, descriptions }),
    /Missing text.*datasets\.TEST.*codes\.unit\.MIO_EUR.*dimensions\.geo\.BG/,
  );
});

test('merge reports new dataset fields and keeps data last', () => {
  const old = { id: 'x', sources: [], unit: 'EUR', data: [{ date: '2020-12-31', value: 1 }] };
  const next = { id: 'x', sources: [], dataset: { id: 'T' }, unit: 'EUR', data: [{ date: '2020-12-31', value: 1 }] };
  const { charts, diff } = mergeSeries([old], next);
  assert.equal(Object.keys(charts[0]).at(-1), 'data');
  assert.deepEqual(charts[0].dataset, { id: 'T' });
  assert.equal(diff.dataset, 'added');
  assert.equal(mergeSeries(charts, next).diff.dataset, null);
});

test('merge does not cite a source twice', () => {
  const source = { name: 'Hand-written', url: ['https://eurostat'] };
  const old = { id: 'x', sources: [source], data: [] };
  const { charts } = mergeSeries([old], { id: 'x', sources: [{ name: 'Generated', url: ['https://eurostat'] }], data: [] });
  assert.deepEqual(charts[0].sources, [source]);
});
