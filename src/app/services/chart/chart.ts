import moment from 'moment';

const BG_MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];

const FONT = 'Sofia Sans';
const AXIS_LABEL_FONT_PX = 14;
const AXIS_LEFT_GUTTER = 16;
const AXIS_LEFT_MIN = 120;
/* ECharts counts its ticks from the axis minimum: a round year here gives round decades. */
const FROM_YEAR = 1790;
const INITIAL_TICK_COUNT = 24;

const GRID_TOP_PX = 4;
/* Where the bars end and the lines begin, in percent of the chart. The difference
   is the room for the value axes' names over the lines. */
const BARS_BOTTOM_PCT = 42;
const LINES_TOP_PCT = 61.5;
const XAXIS_LABELS_PX = 20;

/* The column the HTML legend stands in, as `w-44` in the index template. */
const LEGEND_COLUMN_PX = 176;
const LEGEND_GAP_PX = 20;
const NARROW_RIGHT_PX = 24;

/** Below this viewport width the legend runs under the chart. Matches `min-[1000px]` in the template. */
export const NARROW_WIDTH_PX = 1000;

const PERCENT_AXIS_WIDTH_PX = 52;
const INDEX_AXIS_WIDTH_PX = 48;
const MONEY_AXIS_WIDTH_PX = 76;

const YEAR_TICK_STEPS = [1, 2, 5, 10, 20, 50, 100];
const MIN_TICK_SPACING_PX = 40;

const axisNumber = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 2 });

function measureMaxLabelWidth(labels: readonly string[]): number {
  const ctx = document.createElement('canvas').getContext('2d');

  if (!ctx) {
    return 0;
  }

  ctx.font = `${AXIS_LABEL_FONT_PX}px "${FONT}"`;

  return Math.ceil(Math.max(0, ...labels.map((label) => ctx.measureText(label).width)));
}

/**
 * How many ticks to ask ECharts for, so they land on a round step of years and stay far
 * enough apart that `hideOverlap` has nothing to drop. Zoomed in past a year, it picks months.
 */
export function timeTickCount(widthPx: number, visibleYears: number): number {
  const pxPerYear = widthPx / visibleYears;

  if (pxPerYear >= MIN_TICK_SPACING_PX * 2) {
    return Math.round(widthPx / MIN_TICK_SPACING_PX);
  }

  const step = YEAR_TICK_STEPS.find((years) => pxPerYear * years >= MIN_TICK_SPACING_PX) ?? 100;

  return Math.max(1, Math.round(visibleYears / step));
}

export function gridRight(narrow: boolean): number {
  return narrow ? NARROW_RIGHT_PX : LEGEND_COLUMN_PX + LEGEND_GAP_PX;
}

/** Which units the shown lines are in. */
export interface ValueAxes {
  percent: boolean;
  index: boolean;
  money: boolean;
  /** A deficit line in % of GDP is on, so its limit is drawn and kept in view. */
  deficitLimit: boolean;
}

/** The EU's limit on a deficit, in % of GDP. */
export const DEFICIT_LIMIT_PERCENT = -3;

/* One below the limit when the lines stop short of it, so it doesn't lie on the axis's edge; left to ECharts otherwise. */
const reachLimit = ({ min }: { min: number }) => (min > DEFICIT_LIMIT_PERCENT ? DEFICIT_LIMIT_PERCENT - 1 : null);

/** Each unit has its own axis, so an index near 100 is not flattened by a GDP in the millions. */
export function valueAxisIndex(unit: string): number {
  return unit === 'percent' ? 1 : unit === 'index' ? 2 : 3;
}

function moneyAxisOffset(axes: ValueAxes): number {
  return (axes.percent ? PERCENT_AXIS_WIDTH_PX : 0) + (axes.index ? INDEX_AXIS_WIDTH_PX : 0);
}

/** The value axes as the shown series need them: an axis with nothing on it steps aside. Positional, after the bars' axis. */
export function valueAxesPatch(axes: ValueAxes): any[] {
  return [
    {},
    { show: axes.percent, splitLine: { show: axes.percent }, min: axes.deficitLimit ? reachLimit : null },
    { show: axes.index, offset: axes.percent ? PERCENT_AXIS_WIDTH_PX : 0, splitLine: { show: axes.index && !axes.percent } },
    { show: axes.money, offset: moneyAxisOffset(axes), splitLine: { show: axes.money && !axes.percent && !axes.index } },
  ];
}

function gridLeft(rows: readonly string[], axes: ValueAxes): number {
  const forRows = Math.max(AXIS_LEFT_MIN, measureMaxLabelWidth(rows) + AXIS_LEFT_GUTTER);

  return axes.money ? Math.max(forRows, moneyAxisOffset(axes) + MONEY_AXIS_WIDTH_PX) : forRows;
}

/** Both grids, which stay aligned: three stacked value axes need more room than the country names. */
export function gridLeftPatch(rows: readonly string[], axes: ValueAxes): { left: number }[] {
  const left = gridLeft(rows, axes);

  return [{ left }, { left }];
}

export function bigTimeChart(
  series: any,
  rows: string[],
  legend: { data: string[]; selected: Record<string, boolean> },
  view: ValueAxes & { narrow: boolean; visibleRows: number; moneyAxisName: string }
) {
  const min = `${FROM_YEAR}-01-01`;
  /* On a year boundary, so the axis does not end on a long date label. */
  const max = moment().add(3, 'months').add(1, 'years').startOf('year').format('YYYY-MM-DD');
  const left = gridLeft(rows, view);
  const right = gridRight(view.narrow);
  const [, percentAxis, indexAxis, moneyAxis] = valueAxesPatch(view);

  /* The two grids are one time axis drawn twice. */
  const xAxisCommon = {
    show: true,
    type: 'time',
    splitNumber: INITIAL_TICK_COUNT,
    splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'solid' } },
    axisTick: { show: true, lineStyle: { color: '#d1d5db' } },
    axisLine: { show: true, lineStyle: { color: '#e5e7eb' } },
    axisLabel: {
      show: true,
      hideOverlap: true,
      fontFamily: FONT,
      fontSize: 11.5,
      color: '#6b7280',
      formatter: (value: number) => {
        const date = new Date(value);

        if (date.getMonth() === 0 && date.getDate() === 1) {
          return String(date.getFullYear());
        }

        return date.getDate() === 1 ? BG_MONTHS[date.getMonth()] : `${date.getDate()} ${BG_MONTHS[date.getMonth()]}`;
      },
    },
    /* A reading aid only: the tooltip stays with what is under the cursor. */
    axisPointer: {
      show: true,
      type: 'line',
      snap: false,
      triggerTooltip: false,
      triggerEmphasis: false,
      lineStyle: { color: '#0f1115', type: 'dashed', width: 1 },
      label: {
        show: true,
        margin: 3,
        padding: [2, 6],
        backgroundColor: '#1f2937',
        borderWidth: 0,
        shadowBlur: 0,
        color: '#ffffff',
        fontFamily: FONT,
        fontSize: 12,
        formatter: (params: { value: number }) => {
          const date = new Date(params.value);

          return `${date.getDate()} ${BG_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
        },
      },
    },
    min,
    max,
  };

  const valueAxisCommon = {
    type: 'value',
    gridIndex: 1,
    position: 'left',
    nameLocation: 'end',
    nameGap: 8,
    nameTextStyle: { fontFamily: FONT, fontSize: 12, color: '#6b7280' },
    axisLine: { show: true, lineStyle: { color: '#d1d5db' } },
    axisLabel: { fontFamily: FONT, fontSize: 12, color: '#6b7280', formatter: (value: number) => axisNumber.format(value) },
    axisPointer: { show: false },
  };

  return {
    axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
    tooltip: {
      confine: true,
      transitionDuration: 0,
      position: (
        point: [number, number],
        _params: unknown,
        _dom: unknown,
        _rect: unknown,
        size: { contentSize: [number, number]; viewSize: [number, number] }
      ) => {
        const [px, py] = point;
        const [tw, th] = size.contentSize;
        const [vw] = size.viewSize;
        let x = px + 20;
        let y = py - th - 10;

        if (x + tw > vw) {
          x = px - tw - 20;
        }

        if (y < 0) {
          y = py + 20;
        }

        return [Math.round(x), Math.round(y)];
      },
      backgroundColor: '#ffffff',
      borderColor: 'rgba(15,17,21,0.08)',
      borderWidth: 1,
      padding: 0,
      extraCssText: 'box-shadow:0 2px 8px rgba(15,17,21,0.06),0 12px 32px rgba(15,17,21,0.1);border-radius:8px;overflow:hidden;',
      textStyle: { fontFamily: "'Sofia Sans', sans-serif", fontSize: 14, color: '#1e293b' },
    },
    grid: [
      { top: GRID_TOP_PX, bottom: `${BARS_BOTTOM_PCT}%`, right, left, outerBoundsMode: 'none' },
      { top: `${LINES_TOP_PCT}%`, bottom: XAXIS_LABELS_PX, right, left, outerBoundsMode: 'none' },
    ],
    /* Never drawn: the HTML legend shows the series. It stays because it is what filters them. */
    legend: { show: false, data: legend.data, selected: legend.selected },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        /* Nothing is dropped: a line needs its points outside the view to run on to the edge of the grid. */
        filterMode: 'none',
      },
      /* The scrollbar of the rows: a window of fixed size over them. */
      {
        type: 'slider',
        yAxisIndex: 0,
        filterMode: 'none',
        zoomLock: true,
        startValue: 0,
        endValue: view.visibleRows - 1,
        left: 0,
        width: 8,
        showDetail: false,
        showDataShadow: false,
        brushSelect: false,
        handleSize: 0,
        moveHandleSize: 0,
        borderColor: 'transparent',
        backgroundColor: '#f3f4f6',
        fillerColor: '#9ca3af',
        emphasis: { handleStyle: { borderColor: 'transparent' } },
      },
    ],
    xAxis: [
      /* The years are read under the lines: the bars keep only the gridlines that line up with them. */
      {
        ...xAxisCommon,
        gridIndex: 0,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        axisPointer: { ...xAxisCommon.axisPointer, label: { show: false } },
      },
      /* Under the lines, which the pointer would otherwise cut through. */
      { ...xAxisCommon, gridIndex: 1, axisPointer: { ...xAxisCommon.axisPointer, z: 1 } },
    ],
    yAxis: [
      {
        gridIndex: 0,
        data: rows,
        /* A country's name opens its panel. */
        triggerEvent: true,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisPointer: { show: false },
        splitLine: { show: true, lineStyle: { color: '#e2e8f0' } },
        axisLabel: { fontFamily: FONT, fontSize: AXIS_LABEL_FONT_PX, color: '#1f2937', interval: 0 },
      },
      {
        ...valueAxisCommon,
        ...percentAxis,
        name: '%',
        splitLine: { ...percentAxis.splitLine, lineStyle: { color: '#e5e7eb' } },
      },
      {
        ...valueAxisCommon,
        ...indexAxis,
        name: 'индекс',
        splitLine: { ...indexAxis.splitLine, lineStyle: { color: '#e5e7eb' } },
      },
      {
        ...valueAxisCommon,
        ...moneyAxis,
        name: view.moneyAxisName,
        splitLine: { ...moneyAxis.splitLine, lineStyle: { color: '#e5e7eb' } },
      },
    ],
    animation: false,
    series: series,
    textStyle: { fontFamily: FONT, fontSize: 14 },
  };
}
