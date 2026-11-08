export interface Metric {
  id: string;
  name: string;
  /** What the figures are measured in or against, where the name alone leaves it open. It follows the country in a series' title. */
  measure?: string;
  /** Left off the page, with its series still in the data. */
  hidden?: boolean;
}

/* A series' id is `<metric id>-<Eurostat geo code>`. The hidden ones stay listed
   so that their ids still resolve: `gdp-per-capita-in-pps-…` also starts with `gdp-`. */
const ALL_METRICS: Metric[] = [
  { id: 'deficit-surplus', name: 'Дефицит и излишък', measure: '% от БВП' },
  { id: 'deficit-surplus-eur', name: 'Дефицит и излишък', measure: 'евро' },
  { id: 'government-debt', name: 'Държавен дълг', measure: '% от БВП' },
  { id: 'government-debt-eur', name: 'Държавен дълг', measure: 'евро' },
  { id: 'gdp-per-capita-in-pps', name: 'БВП на човек в СПС', measure: 'ЕС-27 = 100', hidden: true },
  { id: 'gdp', name: 'БВП' },
  { id: 'hicp', name: 'ХИПЦ' },
];

/** The metrics a reader can turn on together. */
export const METRICS = ALL_METRICS.filter((metric) => !metric.hidden);

export function metricLabel(metric: Metric): string {
  return metric.measure ? `${metric.name} (${metric.measure})` : metric.name;
}

/* The euro area as a whole: its series stay in the data, off the page. */
const EUROZONE_CODE = 'ea21';

const COUNTRY_NAMES = new Map([
  ['at', 'Австрия'],
  ['be', 'Белгия'],
  ['bg', 'България'],
  ['hr', 'Хърватия'],
  ['cy', 'Кипър'],
  ['cz', 'Чехия'],
  ['dk', 'Дания'],
  ['ee', 'Естония'],
  ['fi', 'Финландия'],
  ['fr', 'Франция'],
  ['de', 'Германия'],
  ['el', 'Гърция'],
  ['hu', 'Унгария'],
  ['ie', 'Ирландия'],
  ['it', 'Италия'],
  ['lv', 'Латвия'],
  ['lt', 'Литва'],
  ['lu', 'Люксембург'],
  ['mt', 'Малта'],
  ['nl', 'Нидерландия'],
  ['pl', 'Полша'],
  ['pt', 'Португалия'],
  ['ro', 'Румъния'],
  ['sk', 'Словакия'],
  ['si', 'Словения'],
  ['es', 'Испания'],
  ['se', 'Швеция'],
]);

const LINE_COLORS = [
  '#0ca8df',
  '#ffd10a',
  '#fb628b',
  '#785db0',
  '#9e9d24',
  '#d84315',
  '#f0822e',
  '#3fbe95',
  '#6a1b9a',
  '#1a237e',
  '#64dd17',
  '#8a6d3b',
  '#e040fb',
  '#3d5a80',
  '#c0392b',
  '#4e342e',
  '#00796b',
  '#7f8c8d',
  '#5c6bc0',
  '#b8860b',
  '#ad1457',
  '#558b2f',
  '#00acc1',
];

const COUNTRY_ORDER = [...COUNTRY_NAMES.values()].sort((a, b) => a.localeCompare(b, 'bg'));

/* Longest id first: `gdp-per-capita-in-pps-…` also starts with `gdp-`. */
const BY_LONGEST_ID = [...ALL_METRICS].sort((a, b) => b.id.length - a.id.length);

export function metricOf(seriesId: string): Metric | undefined {
  return BY_LONGEST_ID.find((metric) => seriesId.startsWith(`${metric.id}-`));
}

/** Whether a series belongs on the page. */
export function isOffered(seriesId: string): boolean {
  return !metricOf(seriesId)?.hidden && !seriesId.endsWith(`-${EUROZONE_CODE}`);
}

/** The country's Bulgarian name. */
export function countryOf(seriesId: string): string {
  const metric = metricOf(seriesId);
  const code = metric ? seriesId.slice(metric.id.length + 1) : seriesId;

  return COUNTRY_NAMES.get(code) ?? code;
}

export function seriesLabel(seriesId: string): string {
  const metric = metricOf(seriesId);

  return `${metric?.name} на ${countryOf(seriesId)}${metric?.measure ? ` (${metric.measure})` : ''}`;
}

/** By country, so a country keeps its colour across metrics. */
export function countryColor(country: string): string {
  return LINE_COLORS[Math.max(0, COUNTRY_ORDER.indexOf(country)) % LINE_COLORS.length];
}
