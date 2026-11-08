import * as echarts from 'echarts/core';
import moment from 'moment/moment';
import { humanDateDiff, humanDate } from '../utils';
import { ValueAxes, valueAxisIndex } from './chart';
import { countryColor, countryOf, seriesLabel } from './metrics';

const FONT = 'Sofia Sans';
const EU_BLUE = '#003399';
const CARD_FONT = "font-family:'Sofia Sans',sans-serif;";
const MAX_BAR_HEIGHT_PX = 28;
const MIN_BAR_HEIGHT_FOR_LABEL = 12;
const BAR_FILL = 0.8;
/* Hovering a bar lifts its rects above any sibling at z2 0, so the label sits clear of that. */
const LABEL_Z2 = 5;
const FLAG_WIDTH_PX = 13;
const FLAG_HEIGHT_PX = 10;
export const GANTT_SERIES_ID = 'gantt';
const BAR_NORMAL = 0;
const BAR_PICKED = 1;
const BAR_RELATED = 2;
const BAR_DIMMED = 3;
const DIM_FACTOR = 0.35;
const MIN_PICKED_OPACITY = 0.4;
const PICKED_GROWTH = 1.2;
/* A band lies under the bars, a single-day line over them. Among the data lines
   (ECharts draws a line series at z 3) both lie under, over the reference lines. */
const UNDER_BARS_Z = 5;
const OVER_BARS_Z = 15;
const UNDER_LINES_Z = 2;
const EURO_ENTRY_SERIES_IDS = ['euro-entry-bars', 'euro-entry-lines'];
const EURO_ENTRY_WIDTH_PX = 1;

export const CHANGE_COLORS = {
  up: { text: '#b45309', band: '#fff4e5' },
  down: { text: '#1d4ed8', band: '#e8efff' },
} as const;

const textWidthCache = new Map<string, number>();
const number = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 2 });
const labelNumber = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 1 });

/* A true minus: the hyphen `Intl` prints is a dash's width short of the plus. */
export const tooltipNumber = (value: number) => number.format(value).replace('-', '−');
export const signed = (value: number) => `${value > 0 ? '+' : ''}${tooltipNumber(value)}`;
const formatLabel = (value: number) => labelNumber.format(Math.round(value * 10) / 10 + 0);

function pointTooltip(title: string, suffix: string, marker: string, content: any): string {
  const { date, value, change = 0, change_percent: changePercent = 0 } = content;
  const unit = suffix ? `<span style="font-size:14px;font-weight:600;color:#475569;margin-left:1px;">${suffix}</span>` : '';
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : null;
  const band = direction
    ? `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:11px;padding:8px 14px 10px;background:${CHANGE_COLORS[direction].band};color:${CHANGE_COLORS[direction].text};font-size:13px;">
          <div style="font-weight:700;"><span style="font-size:12px;">${direction === 'up' ? '▲' : '▼'}</span> ${signed(change)}${suffix === '%' ? ' пр.п.' : ''}</div>
          <div style="font-weight:600;white-space:nowrap;">${signed(changePercent)}%</div>
        </div>`
    : '';

  return `<div style="${CARD_FONT}max-width:420px;min-width:220px;padding:12px 0 ${direction ? 0 : 13}px;white-space:normal;word-wrap:break-word;line-height:1.3;">
      <div style="font-size:14px;font-weight:700;color:#0f1115;padding:0 14px;">${marker}${title}</div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:8px;padding:0 14px;">
        <div style="font-size:22px;font-weight:800;color:#0f1115;letter-spacing:-0.01em;font-variant-numeric:tabular-nums;">${tooltipNumber(value)}${unit}</div>
        <div style="font-size:13px;color:#64748b;white-space:nowrap;">${moment(date).format('D MMM YYYY')}</div>
      </div>
      ${band}
    </div>`;
}

/**
 * How a line's data points are drawn. Small ones leave the trend to the line; their
 * transparent border keeps a point easy to hover, which is what opens its tooltip.
 */
export function pointStyle(small: boolean) {
  return small
    ? { symbol: 'circle', symbolSize: 3, itemStyle: { borderColor: 'transparent', borderWidth: 8 } }
    : { symbol: 'emptyCircle', symbolSize: 5, itemStyle: { borderWidth: 0 } };
}

export function buildLineChart(chart: any, showLabels: boolean, smallPoints: boolean, xAxisIndex: number, yAxisIndex: number) {
  const color = countryColor(countryOf(chart.id));
  const title = seriesLabel(chart.id);
  const suffix = chart.unit === 'percent' ? '%' : '';
  const points = pointStyle(smallPoints);

  return {
    name: chart.id,
    type: 'line',
    tooltip: {
      formatter: (params: any) => pointTooltip(title, suffix, params.marker, params.data.content),
    },
    symbol: points.symbol,
    symbolSize: points.symbolSize,
    /* The point under the cursor shows its number even with the labels off. */
    emphasis: { focus: 'series', scale: 2.2, label: { show: true } },
    xAxisIndex: xAxisIndex,
    yAxisIndex: yAxisIndex,
    label: {
      show: showLabels,
      position: 'top',
      fontFamily: FONT,
      fontSize: 12,
      formatter: (params: any) => formatLabel(params.data.value[1]),
    },
    /* Lines run close together: what would collide is left out, and stays a hover away. */
    labelLayout: { hideOverlap: true },
    itemStyle: { ...points.itemStyle, color },
    lineStyle: { color },
    ...chart?.meta?.style,
    data: chart.data.map((item: any) => ({
      content: {
        unit: chart.unit,
        magnitude: chart.magnitude ?? 1,
        change: item?.change,
        change_percent: item?.change_percent,
        date: item.date,
        value: item.value,
      },
      value: [item.date, item.value],
    })),
  };
}

export function buildGanttChart(groups: any, styles: any, index = 0) {
  const data: any[] = [];

  groups.forEach((group: any, row: number) => {
    group.periods.forEach((period: any, periodIndex: number) => {
      const { from, to } = periodSpan(period);

      data.push({
        content: {
          type: 'gantt',
          rowIndex: row,
          periodIndex: periodIndex,
          group: group.name,
          name: period.name,
          description: period.description,
          date: period.date,
          source: period.sources?.[0],
          from: from,
          to: to,
        },
        name: period.name,
        /* Row, start, end, label, flag code, opacity, selection state. A currency before the euro is a faint bar. */
        value: [row, from, to, period.name, period.flag.toLowerCase(), styles?.[period.style]?.opacity ?? 1, BAR_NORMAL],
        itemStyle: { color: EU_BLUE },
      });
    });
  });

  return {
    id: GANTT_SERIES_ID,
    type: 'custom',
    tooltip: {
      formatter: timeRangeLabel,
    },
    renderItem: renderBar,
    encode: {
      x: [1, 2],
      y: 0,
    },
    data: data,
    xAxisIndex: index,
    yAxisIndex: index,
    z: 10,
  };
}

/** The bars with the picked period raised, its country's others and the searched countries kept, and every other country faded. */
export function ganttWithSelection(data: any[], pick: { rowIndex: number; periodIndex: number } | null, searchedRows: ReadonlySet<number>): any[] {
  const anySelected = !!pick || searchedRows.size > 0;

  return data.map((bar) => {
    const { rowIndex, periodIndex } = bar.content;
    const inPickedRow = rowIndex === pick?.rowIndex;
    const state = !anySelected ? BAR_NORMAL : inPickedRow && periodIndex === pick?.periodIndex ? BAR_PICKED : inPickedRow || searchedRows.has(rowIndex) ? BAR_RELATED : BAR_DIMMED;

    return { ...bar, value: [...bar.value.slice(0, 6), state] };
  });
}

function renderBar(params: any, api: any) {
  const label = String(api.value(3));
  const flag = String(api.value(4));
  const state = api.value(6);
  const picked = state === BAR_PICKED;
  const dim = state === BAR_DIMMED ? DIM_FACTOR : 1;
  /* A faint currency bar has to stand out once it is the picked one. */
  const opacity = (picked ? Math.max(api.value(5), MIN_PICKED_OPACITY) : api.value(5)) * dim;
  const categoryIndex = api.value(0);
  const start = api.coord([api.value(1), categoryIndex]);
  const end = api.coord([api.value(2), categoryIndex]);
  const height = Math.min(api.size([0, 1])[1] * BAR_FILL, MAX_BAR_HEIGHT_PX) * (picked ? PICKED_GROWTH : 1);
  const y = start[1] - height / 2;
  const barWidth = end[0] - start[0];
  const color = api.visual('color');
  const coordSys = { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height };
  const clip = (x: number, width: number) => echarts.graphic.clipRectByRect({ x, y, width, height }, coordSys);
  const barShape = clip(start[0], barWidth);

  if (!barShape) {
    return null;
  }

  const accentWidth = Math.min(4, barWidth);
  const accentShape = clip(start[0], accentWidth);
  const visibleStart = Math.max(start[0], coordSys.x);
  const visibleEnd = Math.min(end[0], coordSys.x + coordSys.width);

  let labelWidth = textWidthCache.get(label);

  if (labelWidth === undefined) {
    labelWidth = echarts.format.getTextRect(label, `12px "${FONT}"`).width;
    textWidthCache.set(label, labelWidth);
  }

  const flagX = visibleStart + accentWidth + 6;
  const room = visibleEnd - flagX - 4;
  const showFlag = room >= FLAG_WIDTH_PX && height >= MIN_BAR_HEIGHT_FOR_LABEL;
  const textX = flagX + FLAG_WIDTH_PX + 5;
  const showLabel = showFlag && room >= FLAG_WIDTH_PX + 5 + labelWidth;

  return {
    type: 'group',
    children: [
      {
        type: 'rect',
        transition: ['shape'],
        shape: { ...barShape, r: 3 },
        style: { fill: color, stroke: picked ? '#0f172a' : 'rgba(0,0,0,0.22)', lineWidth: picked ? 2 : 1, opacity },
        emphasis: { style: { opacity: Math.min(opacity + 0.15, 1), stroke: 'rgba(0,0,0,0.55)', lineWidth: 1.5 } },
      },
      accentShape && {
        type: 'rect',
        shape: { ...accentShape, r: [3, 0, 0, 3] },
        style: { fill: 'rgba(0,0,0,0.28)', opacity: dim },
      },
      showFlag
        ? {
            type: 'image',
            z2: LABEL_Z2,
            style: { image: `flags/${flag}.svg`, x: flagX, y: y + (height - FLAG_HEIGHT_PX) / 2, width: FLAG_WIDTH_PX, height: FLAG_HEIGHT_PX, opacity: dim },
          }
        : null,
      showLabel
        ? {
            type: 'text',
            z2: LABEL_Z2,
            style: {
              text: label,
              x: textX,
              y: y + height / 2,
              fill: opacity < 0.5 ? '#1e293b' : '#FFF',
              opacity: dim,
              fontFamily: FONT,
              fontSize: 12,
              textAlign: 'left',
              textVerticalAlign: 'middle',
              width: Math.max(0, visibleEnd - textX - 6),
              overflow: 'truncate',
            },
          }
        : null,
    ].filter(Boolean),
  };
}

const isSingleDay = (item: any): boolean => item.value.length === 1;

/** The dropdown's order: the single days by date, then the spans by start. */
export function inMenuOrder(events: any[]): any[] {
  const rank = (event: any) => (isSingleDay(event.items[0]) ? 0 : 1);

  /* ISO dates sort as text. */
  return [...events].sort((a, b) => rank(a) - rank(b) || a.items[0].value[0].localeCompare(b.items[0].value[0]));
}

/* One grid's marks of an event: a band per span, a line per single day. Both grids
   share the series name, so the one legend entry switches them together. */
export function buildEventSeries(event: any, axisIndex: number) {
  const overBars = axisIndex === 0;
  const { itemStyle } = event.meta.style;
  const labelled = !overBars && event.meta.label !== false;

  return {
    type: 'line',
    name: event.id,
    data: [],
    xAxisIndex: axisIndex,
    yAxisIndex: axisIndex,
    markArea: {
      /* Among the bars the band must not take the hover, so it is read in the line grid. */
      silent: overBars,
      ...(overBars ? { z: UNDER_BARS_Z } : {}),
      animation: false,
      emphasis: { disabled: true },
      label: { show: labelled, position: 'inside', rotate: 90, color: '#333', fontFamily: FONT, fontSize: 12 },
      tooltip: { formatter: timeRangeLabel },
      /* Epochs rather than the file's date strings: ECharts reads those as local midnight, the bars beside the band as UTC. */
      data: event.items
        .filter((item: any) => !isSingleDay(item))
        .map((item: any) => {
          const from = +new Date(item.value[0]);
          const to = item.value[1] === null ? Date.now() : +new Date(item.value[1]);

          return [{ name: item.name, xAxis: from, content: { name: item.name, description: item.description, from, to }, itemStyle }, { xAxis: to }];
        }),
    },
    markLine: {
      silent: overBars,
      z: overBars ? OVER_BARS_Z : UNDER_LINES_Z,
      animation: false,
      symbol: 'none',
      emphasis: { lineStyle: { width: 4 } },
      label: { show: labelled, position: 'insideEndTop', formatter: '{b}', color: '#333', fontFamily: FONT, fontSize: 12, backgroundColor: 'rgba(255, 255, 255, 0.85)', padding: [1, 3] },
      tooltip: { formatter: dayTooltip },
      data: event.items.filter(isSingleDay).map((item: any) => ({
        name: item.name,
        xAxis: +new Date(item.value[0]),
        content: { name: item.name, description: item.description, date: item.value[0] },
        lineStyle: { color: itemStyle.color, type: 'solid', width: 2 },
      })),
    },
  };
}

function dayTooltip(params: any): string {
  const { name, description, date } = params.data.content;
  const now = Date.now();
  const time = +new Date(date);
  const distance = time < now ? `${humanDateDiff(date, now)} до днес` : `след около ${humanDateDiff(now, date)}`;

  return eventCard(name, humanDate(date), distance, description);
}

/* Over the bars, but under the data lines. */
const CURRENT_DATE_OVER_BARS_Z = 20;
const CURRENT_DATE_UNDER_LINES_Z = 2;

export function buildCurrentDateLine(axisIndex = 0) {
  const now = Date.now();
  const z = axisIndex === 0 ? CURRENT_DATE_OVER_BARS_Z : CURRENT_DATE_UNDER_LINES_Z;
  const today = moment().format('D MMMM YYYY');

  return {
    type: 'line',
    data: [],
    markLine: {
      z,
      /* A markLine has no stroke of its own, so the outline is a wider, darker copy drawn first. */
      data: [
        { xAxis: now, lineStyle: { color: '#00873d', type: 'solid', width: 5 }, label: { show: false } },
        { xAxis: now, lineStyle: { color: '#00e676', type: 'solid', width: 3 }, label: { show: false } },
      ],
      tooltip: {
        formatter: () =>
          `<div style="${CARD_FONT}min-width:160px;border-left:4px solid #00e676;padding:10px 14px;">
            <div style="font-size:13px;font-weight:700;color:#00873d;margin-bottom:4px;">Днес</div>
            <div style="font-size:14px;font-weight:600;color:#0f1115;">${today}</div>
          </div>`,
      },
      silent: false,
      animation: false,
      symbol: 'none',
    },
    xAxisIndex: axisIndex,
    yAxisIndex: axisIndex,
    z,
  };
}

/**
 * The zero level that a surplus and a deficit are read against. One line: with the
 * percent and money axes both on, their zeros sit at different heights, and the percent one speaks.
 */
export function zeroLines(axes: ValueAxes) {
  return [buildZeroLine('zero-line-percent', 1, axes.percent), buildZeroLine('zero-line-money', valueAxisIndex('EUR'), axes.money && !axes.percent)];
}

function buildZeroLine(id: string, yAxisIndex: number, shown: boolean) {
  return {
    id,
    type: 'line',
    data: [],
    markLine: {
      z: 1,
      silent: true,
      animation: false,
      symbol: 'none',
      label: { show: false },
      lineStyle: { color: '#0f1115', type: 'solid', width: 1 },
      /* Hovering a series line fades the others, which must not take this along. */
      blur: { lineStyle: { opacity: 1 } },
      data: shown ? [{ yAxis: 0 }] : [],
    },
    xAxisIndex: 1,
    yAxisIndex: yAxisIndex,
  };
}

/** The lines at the dates countries joined the eurozone, one series per grid. Without dates they draw nothing. */
export function euroEntryLines(dates: readonly number[]) {
  return EURO_ENTRY_SERIES_IDS.map((id, axisIndex) => ({
    id,
    type: 'line',
    data: [],
    markLine: {
      z: axisIndex === 0 ? OVER_BARS_Z : UNDER_LINES_Z,
      silent: true,
      animation: false,
      symbol: 'none',
      label: { show: false },
      lineStyle: { color: '#000000', type: 'solid', width: EURO_ENTRY_WIDTH_PX },
      /* Hovering a series line fades the others, which must not take this along. */
      blur: { lineStyle: { opacity: 1 } },
      data: dates.map((date) => ({ xAxis: date })),
    },
    xAxisIndex: axisIndex,
    yAxisIndex: axisIndex,
  }));
}

function eventCard(name: string, dates: string, duration: string, description?: string): string {
  const desc = description ? `<div style="color:#4b5563;font-size:13px;margin-top:10px;line-height:1.5;">${description}</div>` : '';

  return `<div style="${CARD_FONT}max-width:420px;min-width:220px;border-left:4px solid #6b7280;padding:14px 16px;white-space:normal;word-wrap:break-word;">
    <div style="font-size:16px;font-weight:700;color:#0f1115;line-height:1.25;margin-bottom:10px;">${name}</div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
      <div style="font-size:13px;font-weight:600;color:#1f2937;">${dates}</div>
      <div style="font-size:13px;color:#4b5563;white-space:nowrap;">${duration}</div>
    </div>
    ${desc}
  </div>`;
}

function rangeEnd(to: number): string {
  return moment(to).isSame(moment(), 'day') ? 'до днес' : humanDate(to);
}

/* Many old currencies are dated to the year or month only: a full date would claim more than is known. */
function periodPoint(point: any, time: number): string {
  if (point?.date) {
    return humanDate(point.date);
  }

  return moment(time).format(point?.dateMonth ? 'MMMM YYYY г.' : 'YYYY г.');
}

/** A period's start and end in ms; one still running ends now. */
export function periodSpan(period: any): { from: number; to: number } {
  const [start, end] = period.date.range;

  return { from: +new Date(start), to: end === null ? Date.now() : +new Date(end) };
}

export function periodDates(date: any, from: number, to: number): string {
  return `${periodPoint(date.from, from)} — ${date.to && Object.keys(date.to).length ? periodPoint(date.to, to) : 'до днес'}`;
}

export function periodDuration(date: any, from: number, to: number): string {
  if (date.from?.date && (date.to?.date || !date.to)) {
    return humanDateDiff(from, to);
  }

  return roundDuration(from, to);
}

/** Whole years, or whole months for a span shorter than a year. */
export function roundDuration(from: number, to: number): string {
  const years = moment(to).diff(from, 'years');

  if (years > 0) {
    return `${years} ${years === 1 ? 'година' : 'години'}`;
  }

  const months = moment(to).diff(from, 'months');

  return `${months} ${months === 1 ? 'месец' : 'месеца'}`;
}

function sourceBlock(source: any): string {
  if (!source?.quote) {
    return '';
  }

  const quote = source.quote.length > 200 ? `${source.quote.slice(0, 200)}…` : source.quote;

  return `<div style="border-top:1px solid #f4f5f7;margin-top:10px;padding-top:10px;">
    <div style="color:#1f2937;font-size:13px;font-style:italic;line-height:1.5;">„${quote}“</div>
    <div style="color:#6b7280;font-size:13px;margin-top:4px;">${source.name}</div>
  </div>`;
}

function timeRangeLabel(params: any): string {
  const content = params.data?.content;

  if (!content) {
    return '';
  }

  const dates = content.date ? periodDates(content.date, content.from, content.to) : `${humanDate(content.from)} — ${rangeEnd(content.to)}`;
  const duration = content.date ? periodDuration(content.date, content.from, content.to) : humanDateDiff(content.from, content.to);

  if (!content.group) {
    return eventCard(content.name, dates, duration, content.description);
  }

  const fill = params.data?.itemStyle?.color ?? params.color;
  const group = content.group !== content.name ? `<div style="margin-bottom:8px;font-size:13px;font-weight:700;color:#4b5563;">${content.group}</div>` : '';
  const description = content.description ? `<div style="color:#4b5563;font-size:13px;margin-top:10px;line-height:1.5;">${content.description}</div>` : '';

  return `<div style="${CARD_FONT}max-width:420px;min-width:220px;border-left:4px solid ${fill};padding:14px 16px;white-space:normal;word-wrap:break-word;">
    ${group}
    <div style="font-size:16px;font-weight:700;color:#0f1115;line-height:1.25;margin-bottom:10px;">${content.name}</div>
    <div style="height:1px;background:#f4f5f7;margin-bottom:10px;"></div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
      <div style="font-size:13px;font-weight:600;color:#1f2937;">${dates}</div>
      <div style="font-size:13px;color:#4b5563;white-space:nowrap;">${duration}</div>
    </div>
    ${description}${sourceBlock(content.source)}
  </div>`;
}
