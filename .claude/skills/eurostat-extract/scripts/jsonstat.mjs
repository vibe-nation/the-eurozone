#!/usr/bin/env node
// Reads a Eurostat JSON-stat 2.0 export and writes one series in the shape of
// public/data/charts.json. Dimension-agnostic: nothing here is specific to
// gov_10dd_edpt1. No dependencies.
//
//   node jsonstat.mjs inspect <export.json> [--where geo=BG]
//   node jsonstat.mjs extract <export.json> --select geo=BG,sector=S13,na_item=B9,unit=PC_GDP \
//     --id some-kebab-id --name "Име" --into public/data/charts.json [--write]
//
// `extract` is a dry run until --write is passed. Every year in the export is
// always taken: the time dimension cannot be selected.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const SCALE_BY_PREFIX = { THS: 1e3, MIO: 1e6, BN: 1e9 };
const LABELS_FILE = new URL('../references/labels-bg.json', import.meta.url);
const DESCRIPTIONS_FILE = new URL('../references/descriptions.json', import.meta.url);

/** Wraps a parsed JSON-stat dataset with lookups by category code. */
export function openCube(ds) {
  if (ds?.class !== 'dataset' || !Array.isArray(ds.id) || !Array.isArray(ds.size) || !ds.dimension) {
    throw new Error('Not a JSON-stat 2.0 dataset (expected class "dataset" with id, size and dimension).');
  }

  const codes = {};
  for (const id of ds.id) {
    const index = ds.dimension[id].category.index;
    codes[id] = Array.isArray(index) ? index : Object.keys(index).sort((a, b) => index[a] - index[b]);
  }

  const strides = {};
  let stride = 1;
  for (let i = ds.id.length - 1; i >= 0; i--) {
    strides[ds.id[i]] = stride;
    stride *= ds.size[i];
  }

  const timeDim = ds.role?.time?.[0] ?? ds.id.find((id) => /^time(_period)?$/i.test(id));
  if (!timeDim) throw new Error(`No time dimension among: ${ds.id.join(', ')}`);

  const flatIndex = (coords) => ds.id.reduce((sum, id) => sum + codes[id].indexOf(coords[id]) * strides[id], 0);
  const flagAt = (flat) => (typeof ds.status === 'string' ? ds.status : ds.status?.[flat]);

  return {
    ds,
    codes,
    timeDim,
    get: (coords) => ds.value[flatIndex(coords)] ?? undefined,
    flag: (coords) => flagAt(flatIndex(coords)),
    label: (dim, code) => ds.dimension[dim].category.label?.[code] ?? code,
    dimLabel: (dim) => ds.dimension[dim].label ?? dim,
    /** Every observation present, decoded back to its category codes. */
    *observations() {
      const flats = Array.isArray(ds.value)
        ? ds.value.flatMap((value, i) => (value === null ? [] : [i]))
        : Object.keys(ds.value).map(Number);
      for (const flat of flats) {
        const coords = {};
        for (const id of ds.id) {
          coords[id] = codes[id][Math.floor(flat / strides[id]) % codes[id].length];
        }
        yield { coords, value: ds.value[flat], flag: flagAt(flat) };
      }
    },
  };
}

/** A default-view extraction keeps only recent years, whatever the full dataset holds. */
export function isDefaultView(ds) {
  return (ds.extension?.annotation ?? []).some(
    (a) => a.type === 'DISSEMINATION_EXTRACTION_TYPE' && a.title === 'DEFAULT_VIEW',
  );
}

const defaultViewWarning = (cube) => {
  const years = cube.codes[cube.timeDim];
  return (
    `WARNING: this is a Eurostat default-view extraction, cut to ${years[0]}–${years.at(-1)}. ` +
    `The full dataset usually goes back further, so this is not "all years".`
  );
};

function parsePairs(text = '') {
  const pairs = {};
  for (const part of text.split(',').filter(Boolean)) {
    const [key, value] = part.split('=');
    if (!key || !value) throw new Error(`Expected dim=CODE, got "${part}"`);
    pairs[key.trim()] = value.trim();
  }
  return pairs;
}

function assertCodes(cube, select) {
  for (const [dim, code] of Object.entries(select)) {
    if (dim === cube.timeDim) {
      throw new Error(`"${dim}" cannot be selected: every year in the export is always extracted.`);
    }
    if (!cube.codes[dim]) throw new Error(`Unknown dimension "${dim}". Have: ${cube.ds.id.join(', ')}`);
    if (!cube.codes[dim].includes(code)) {
      throw new Error(`Unknown ${dim} code "${code}". Have: ${cube.codes[dim].join(', ')}`);
    }
  }
}

/** Runs of consecutive periods, printed as `1995–2001, 2003–2025`. */
function coverage(cube, times) {
  const all = cube.codes[cube.timeDim];
  const positions = times.map((t) => all.indexOf(t)).sort((a, b) => a - b);
  const runs = [];
  for (const p of positions) {
    const last = runs.at(-1);
    if (last && last[1] === p - 1) last[1] = p;
    else runs.push([p, p]);
  }
  return runs.map(([a, b]) => (a === b ? all[a] : `${all[a]}–${all[b]}`)).join(', ');
}

/** The menu for a slice: what exists, with which units, over which periods. */
export function availability(cube, where) {
  assertCodes(cube, where);
  const unitDim = cube.codes.unit ? 'unit' : null;
  const free = cube.ds.id.filter((id) => id !== cube.timeDim && id !== unitDim && !(id in where) && cube.codes[id].length > 1);

  const series = new Map();
  for (const { coords, flag } of cube.observations()) {
    if (Object.entries(where).some(([dim, code]) => coords[dim] !== code)) continue;
    const key = [...free.map((id) => coords[id]), unitDim ? coords[unitDim] : ''].join('\u0000');
    const entry = series.get(key) ?? { coords, times: [], flags: {} };
    entry.times.push(coords[cube.timeDim]);
    if (flag) entry.flags[flag] = (entry.flags[flag] ?? 0) + 1;
    series.set(key, entry);
  }

  // Units sharing a coverage collapse onto one row.
  const rows = new Map();
  for (const { coords, times, flags } of series.values()) {
    const span = `${coverage(cube, times)} (${times.length})`;
    const flagText = Object.entries(flags).map(([f, n]) => `${f}×${n}`).join(' ');
    const key = [...free.map((id) => coords[id]), span, flagText].join('\u0000');
    const row = rows.get(key) ?? { selection: Object.fromEntries(free.map((id) => [id, coords[id]])), span, flags: flagText, units: [] };
    if (unitDim) row.units.push(coords[unitDim]);
    rows.set(key, row);
  }
  // A selection split by coverage stays together, where the menu reads it as one.
  const order = new Map();
  const place = (row) => {
    const key = JSON.stringify(row.selection);
    if (!order.has(key)) order.set(key, order.size);
    return order.get(key);
  };
  return [...rows.values()].map((row) => [place(row), row]).sort(([a], [b]) => a - b).map(([, row]) => row);
}

/** One fully pinned series, over every period the export has a value for. */
export function readSeries(cube, select) {
  assertCodes(cube, select);
  const pinned = { ...select };
  const open = [];
  for (const id of cube.ds.id) {
    if (id === cube.timeDim || id in pinned) continue;
    if (cube.codes[id].length === 1) pinned[id] = cube.codes[id][0];
    else open.push(id);
  }
  if (open.length) {
    throw new Error(`Pin every dimension to one code. Still open: ${open.map((id) => `${id} (${cube.codes[id].join(', ')})`).join('; ')}`);
  }

  const rows = cube.codes[cube.timeDim].flatMap((time, position) => {
    const coords = { ...pinned, [cube.timeDim]: time };
    const value = cube.get(coords);
    return value === undefined ? [] : [{ time, position, value, flag: cube.flag(coords) }];
  });
  if (!rows.length) throw new Error(`No data for ${JSON.stringify(pinned)}. Run inspect to see what exists.`);
  return { pinned, rows };
}

/**
 * Maps a Eurostat unit code to the chart's `unit` and a multiplier to base units.
 * `MIO_NAC` is not assumed to be euro: it is the country's own currency, so the
 * code is read against its euro sibling, and anything else is refused.
 */
export function resolveUnit(cube, pinned, rows, override = {}) {
  const code = pinned.unit;
  const [, prefix, rest] = code?.match(/^(THS|MIO|BN)_(.+)$/) ?? [null, null, code];
  const scale = override.scale ?? SCALE_BY_PREFIX[prefix] ?? 1;
  if (override.chartUnit) return { chartUnit: override.chartUnit, scale };
  if (/^PC(_|$)/.test(code ?? '')) return { chartUnit: 'percent', scale: 1 };
  if (rest === 'EUR') return { chartUnit: rest, scale };
  if (rest === 'NAC') return { chartUnit: nationalCurrency(cube, pinned, rows, prefix), scale };
  throw new Error(
    `Unit "${code}" has no automatic mapping. charts.json takes EUR, percent or index: pass --chart-unit and ` +
      `--scale if it is one of those (e.g. CP_MEUR is --chart-unit EUR --scale 1e6, I25 is --chart-unit index --scale 1).`,
  );
}

function nationalCurrency(cube, pinned, rows, prefix) {
  const euro = `${prefix}_EUR`;
  if (!cube.codes.unit.includes(euro)) {
    throw new Error(`Cannot tell what currency ${pinned.unit} is without ${euro}. Pass --chart-unit and --scale.`);
  }
  const latest = rows.toReversed().find((row) => row.value && cube.get({ ...pinned, unit: euro, [cube.timeDim]: row.time }));
  if (!latest) throw new Error(`No period shared by ${pinned.unit} and ${euro}. Pass --chart-unit and --scale.`);

  const ratio = latest.value / cube.get({ ...pinned, unit: euro, [cube.timeDim]: latest.time });
  if (Math.abs(ratio - 1) < 0.02) return 'EUR';
  throw new Error(
    `${pinned.unit} for ${JSON.stringify(pinned.geo)} is not in euro (${ratio.toFixed(4)} per euro in ` +
      `${latest.time}), and charts.json cannot state another currency. Use ${euro} instead.`,
  );
}

/** End of the period: charts.json dates a year by its last day. */
export function periodEnd(time) {
  if (/^\d{4}$/.test(time)) return `${time}-12-31`;
  const quarter = time.match(/^(\d{4})-Q([1-4])$/);
  const month = time.match(/^(\d{4})-(\d{2})$/);
  const [year, lastMonth] = quarter ? [+quarter[1], +quarter[2] * 3] : month ? [+month[1], +month[2]] : [];
  if (!year) throw new Error(`Unsupported period "${time}"`);
  const day = new Date(Date.UTC(year, lastMonth, 0)).getUTCDate();
  return `${year}-${String(lastMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const clean = (value) => Number(value.toPrecision(15));
/* A difference of decimals such as 37.7 - 38.4 carries noise at the 15th digit. */
const difference = (value, previous) => Number((value - previous).toFixed(10));

/** Symmetric: bounded by ±200 and defined across a change of sign, which a deficit series has. */
export function symmetricPercent(previous, value) {
  const mean = (Math.abs(previous) + Math.abs(value)) / 2;
  return mean === 0 ? 0 : Number((((value - previous) / mean) * 100).toFixed(2));
}

/** A row after a gap has no comparable previous period, so it reads like the first row. */
export function toPoints(rows, scale) {
  return rows.map((row, i) => {
    const value = clean(row.value * scale);
    const comparable = i > 0 && rows[i - 1].position === row.position - 1;
    if (!comparable) return { date: periodEnd(row.time), value, change: 0, change_percent: 0 };
    const previous = clean(rows[i - 1].value * scale);
    return { date: periodEnd(row.time), value, change: difference(value, previous), change_percent: symmetricPercent(previous, value) };
  });
}

/** The dataset's own code, without a view suffix such as `$DEFAULTVIEW`. */
const datasetCode = ({ ds }) => (ds.extension?.datastructure?.id ?? ds.extension?.id ?? '').split('$')[0];

function sourceFor(cube, pinned, chartUnit, label) {
  const percent = pinned.unit === 'PC_GDP' ? { en: '% of GDP', bg: '% от БВП' } : { en: 'percent', bg: 'процент' };
  const measures = {
    EUR: { en: 'euro', bg: 'евро' },
    index: { en: 'index', bg: 'индекс' },
  };
  const measure = measures[chartUnit] ?? percent;
  return {
    name: { en: `${label.en} (Eurostat, ${measure.en})`, bg: `${label.bg} (Евростат, ${measure.bg})` },
    dataset_id: datasetCode(cube),
    url: [`https://ec.europa.eu/eurostat/databrowser/view/${datasetCode(cube)}/default/table?lang=en`],
  };
}

/**
 * Which dataset and options a series came from. `en` is Eurostat's own wording;
 * `bg` comes from the labels file, since exports hold no Bulgarian. A missing
 * translation stops the run, so an entry never ends up half-labelled. A
 * description explains the chosen code, or the dimension where a code-by-code
 * text would add nothing, as for countries.
 */
function provenance(cube, pinned, labels, descriptions) {
  const code = datasetCode(cube);
  const dimensions = cube.ds.id.filter((id) => id !== cube.timeDim);
  const missing = [];
  const required = (found, name) => {
    if (!found) missing.push(name);
    return found;
  };

  const provenanceLabel = { en: cube.ds.label, bg: required(labels.datasets?.[code], `labels-bg.json: datasets.${code}`) };
  const selection = dimensions.map((dim) => {
    const value = pinned[dim];
    const bg = required(labels.dimensions?.[dim]?.[value], `labels-bg.json: dimensions.${dim}.${value}`);
    const description = required(
      descriptions.codes?.[dim]?.[value] ?? descriptions.dimensions?.[dim],
      `descriptions.json: codes.${dim}.${value}`,
    );
    return [dim, { code: value, label: { en: cube.label(dim, value), bg }, description }];
  });

  if (missing.length) {
    throw new Error(`Missing text, add it under references/: ${missing.join(', ')}`);
  }
  return { id: code, label: provenanceLabel, updated: cube.ds.updated ?? null, selection: Object.fromEntries(selection) };
}

/** The charts.json entry for a selection, plus what the caller should know about it. */
export function buildSeries(cube, { select, id, name, chartUnit, scale, labels, descriptions }) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id ?? '')) throw new Error(`--id must be kebab-case, got "${id}"`);
  if (!name) throw new Error('--name is required');

  const { pinned, rows } = readSeries(cube, select);
  const unit = resolveUnit(cube, pinned, rows, { chartUnit, scale });
  const times = cube.codes[cube.timeDim];
  const gaps = rows.flatMap((row, i) => (i > 0 ? times.slice(rows[i - 1].position + 1, row.position) : []));
  const dataset = provenance(cube, pinned, labels, descriptions);

  return {
    series: {
      id,
      name,
      sources: [sourceFor(cube, pinned, unit.chartUnit, dataset.label)],
      dataset,
      unit: unit.chartUnit,
      data: toPoints(rows, unit.scale),
    },
    report: {
      pinned,
      scale: unit.scale,
      first: rows[0].time,
      last: rows.at(-1).time,
      periods: rows.length,
      exportSpan: `${times[0]}–${times.at(-1)}`,
      gaps,
      flags: rows.filter((row) => row.flag).map((row) => `${row.time}:${row.flag}`),
      defaultView: isDefaultView(cube.ds),
    },
  };
}

/**
 * Adds a series, or replaces the one with its id. A replaced entry keeps what the
 * export cannot supply (shortName, meta) and every source it already cites.
 */
export function mergeSeries(charts, series) {
  const at = charts.findIndex((entry) => entry.id === series.id);
  if (at === -1) return { charts: [...charts, series], action: 'added', diff: null };

  const old = charts[at];
  const cited = new Set((old.sources ?? []).flatMap((source) => source.url ?? []));
  const sources = [...(old.sources ?? []), ...series.sources.filter((source) => !source.url.some((url) => cited.has(url)))];
  // `data` stays last: a key the old entry lacked would otherwise land after it.
  const { data, ...fields } = { ...old, ...series, sources };
  const merged = { ...fields, data };

  const before = new Map(old.data.map((point) => [point.date, point.value]));
  const after = new Map(series.data.map((point) => [point.date, point.value]));
  const diff = {
    unit: old.unit === series.unit ? null : `${old.unit} → ${series.unit}`,
    dataset: JSON.stringify(old.dataset) === JSON.stringify(series.dataset) ? null : old.dataset ? 'changed' : 'added',
    added: [...after.keys()].filter((date) => !before.has(date)),
    removed: [...before.keys()].filter((date) => !after.has(date)),
    changed: [...after.keys()].filter((date) => before.has(date) && before.get(date) !== after.get(date)),
  };
  return { charts: charts.with(at, merged), action: 'replaced', diff };
}

function printInspect(cube, where) {
  const { ds } = cube;
  const times = cube.codes[cube.timeDim];
  const cells = ds.size.reduce((a, b) => a * b, 1);
  const count = Array.isArray(ds.value) ? ds.value.filter((v) => v !== null).length : Object.keys(ds.value).length;
  console.log(`${ds.label}`);
  console.log(`dataset ${ds.extension?.id ?? '?'} | updated ${ds.updated ?? '?'} | ${times[0]}–${times.at(-1)} | ${count} of ${cells} cells`);
  if (isDefaultView(ds)) console.log(defaultViewWarning(cube));

  const pinnedDims = new Set(Object.keys(where));
  for (const dim of ds.id) {
    if (dim === cube.timeDim || pinnedDims.has(dim)) continue;
    console.log(`\n${dim}: ${cube.dimLabel(dim)} (${cube.codes[dim].length})`);
    for (const code of cube.codes[dim]) console.log(`  ${code} = ${cube.label(dim, code)}`);
  }

  if (!pinnedDims.size) {
    console.log('\nNarrow with --where (e.g. --where geo=BG) to see which combinations hold data.');
    return;
  }

  console.log(`\nAvailable for ${Object.entries(where).map(([k, v]) => `${k}=${v}`).join(', ')}:`);
  for (const row of availability(cube, where)) {
    const selection = Object.entries(row.selection).map(([k, v]) => `${k}=${v}`).join(' ');
    const units = row.units.length ? `  [${row.units.join(' ')}]` : '';
    console.log(`  ${selection}${units}  ${row.span}${row.flags ? `  flags: ${row.flags}` : ''}`);
  }
}

function printReport(report, series, merge, into, written) {
  const pinned = Object.entries(report.pinned).map(([k, v]) => `${k}=${v}`).join(' ');
  const { data } = series;
  console.log(`${series.id} [${series.unit}, ×${report.scale}]`);
  console.log(`  ${pinned}`);
  console.log(`  ${report.periods} periods, ${report.first}–${report.last} (export spans ${report.exportSpan})`);
  console.log(`  first ${data[0].date} = ${data[0].value}; last ${data.at(-1).date} = ${data.at(-1).value}`);
  if (report.gaps.length) console.log(`  GAPS, rows after them have change 0: ${report.gaps.join(', ')}`);
  if (report.flags.length) console.log(`  FLAGGED: ${report.flags.join(', ')}`);

  console.log(`  ${into}: would be ${merge.action}`);
  if (merge.diff) {
    const { unit, dataset, added, removed, changed } = merge.diff;
    if (unit) console.log(`  UNIT CHANGES: ${unit}`);
    if (dataset) console.log(`  DATASET FIELDS ${dataset.toUpperCase()}`);
    console.log(`  ${added.length} rows added, ${changed.length} values changed, ${removed.length} rows removed`);
    if (removed.length) console.log(`  REMOVED: ${removed.join(', ')}`);
  }
  console.log(written ? `Wrote ${into}` : 'Dry run: nothing written. Pass --write to apply.');
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      where: { type: 'string' },
      select: { type: 'string' },
      id: { type: 'string' },
      name: { type: 'string' },
      into: { type: 'string' },
      write: { type: 'boolean', default: false },
      'chart-unit': { type: 'string' },
      scale: { type: 'string' },
    },
  });
  const [command, file] = positionals;
  if (!['inspect', 'extract'].includes(command) || !file) {
    throw new Error('Usage: jsonstat.mjs inspect <file> [--where a=b] | extract <file> --select a=b,c=d --id x --name y --into <file> [--write]');
  }

  const cube = openCube(JSON.parse(readFileSync(file, 'utf8')));
  if (command === 'inspect') {
    printInspect(cube, parsePairs(values.where));
    return;
  }

  const chartUnit = values['chart-unit'];
  if (chartUnit && !['EUR', 'percent', 'index'].includes(chartUnit)) {
    throw new Error(`--chart-unit must be EUR, percent or index, got "${chartUnit}"`);
  }
  if (!values.into) throw new Error('--into <file> is required');

  const { series, report } = buildSeries(cube, {
    select: parsePairs(values.select),
    id: values.id,
    name: values.name,
    chartUnit,
    scale: values.scale === undefined ? undefined : Number(values.scale),
    labels: JSON.parse(readFileSync(LABELS_FILE, 'utf8')),
    descriptions: JSON.parse(readFileSync(DESCRIPTIONS_FILE, 'utf8')),
  });
  if (report.defaultView) console.log(defaultViewWarning(cube));

  const existing = existsSync(values.into) ? JSON.parse(readFileSync(values.into, 'utf8')) : [];
  const merge = mergeSeries(existing, series);
  if (values.write) writeFileSync(values.into, `${JSON.stringify(merge.charts, null, 2)}\n`);
  printReport(report, series, merge, values.into, values.write);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
