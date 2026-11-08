import moment from 'moment/moment';
import { convertCurrency, humanDate } from '../utils';
import { valueAxisIndex } from './chart';
import { countryColor, countryOf, metricLabel, metricOf } from './metrics';
import { CHANGE_COLORS, signed, tooltipNumber } from './series';

const PICKED_POINT_SERIES_ID = 'picked-point';

export interface MoneyView {
  currency: string;
  magnitude: string;
  /** How the money axis names it, such as `млн EUR`. */
  unitName: string;
}

/** A line's clicked point, as the detail panel prints it and the chart marks it. */
export interface PointCard {
  seriesId: string;
  date: string;
  metric: string;
  country: string;
  flag: string | null;
  period: string;
  value: string;
  unit: string;
  change: { text: string; percent: string; up: boolean; color: string; band: string } | null;
  sources: { name: string; url: string }[];
  eurostat: { dataset: string; url: string; updated: string; rows: { option: string; code: string; meaning: string }[] };
  mark: { coord: [string, number]; color: string; yAxisIndex: number };
}

/* Months for the monthly series; a year's point is dated by its last day, which says nothing. */
function periodOf(chart: any, date: string): string {
  return chart.dataset.selection.freq.code === 'A' ? `${date.slice(0, 4)} г.` : moment(date).format('MMMM YYYY г.');
}

export function pointCard(chart: any, date: string, money: MoneyView, flag: string | null): PointCard {
  const point = chart.data.find((item: any) => item.date === date);
  const inMoney = chart.unit === 'EUR';
  const shown = (amount: number) => (inMoney ? Number(convertCurrency(amount, 'EUR', money.currency)) / Number(money.magnitude) : amount);
  const unit = inMoney ? money.unitName : chart.unit === 'percent' ? '%' : '';
  const value = shown(point.value);
  const change = shown(point.change);
  const metric = metricOf(chart.id)!;
  const country = countryOf(chart.id);

  return {
    seriesId: chart.id,
    date,
    metric: metricLabel(metric),
    country,
    flag,
    period: periodOf(chart, date),
    value: tooltipNumber(value),
    unit,
    change: change
      ? {
          text: `${signed(change)}${chart.unit === 'percent' ? ' пр.п.' : ''}`,
          percent: `${signed(point.change_percent)}%`,
          up: change > 0,
          color: CHANGE_COLORS[change > 0 ? 'up' : 'down'].text,
          band: CHANGE_COLORS[change > 0 ? 'up' : 'down'].band,
        }
      : null,
    sources: chart.sources.map((source: any) => ({ name: source.name.bg, url: source.url[0] })),
    eurostat: {
      dataset: chart.dataset.id,
      url: chart.sources[0].url[0],
      updated: humanDate(chart.dataset.updated),
      rows: Object.values<any>(chart.dataset.selection).map((item) => ({ option: item.label.en, code: item.code, meaning: item.description })),
    },
    mark: { coord: [date, value], color: countryColor(country), yAxisIndex: valueAxisIndex(chart.unit) },
  };
}

/** The picked point, filled and larger than its neighbours. Silent, so a click on it reaches the point beneath and lets it go. */
export function pickedPointSeries(card: PointCard | null) {
  return {
    id: PICKED_POINT_SERIES_ID,
    type: 'line',
    data: [],
    xAxisIndex: 1,
    yAxisIndex: card?.mark.yAxisIndex ?? 1,
    markPoint: {
      silent: true,
      animation: false,
      symbol: 'circle',
      symbolSize: 13,
      label: { show: false },
      itemStyle: { color: card?.mark.color, borderColor: '#ffffff', borderWidth: 2.5, shadowBlur: 6, shadowColor: 'rgba(15, 17, 21, 0.45)' },
      data: card ? [{ coord: card.mark.coord }] : [],
    },
  };
}
