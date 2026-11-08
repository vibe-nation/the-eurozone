import { convertCurrency } from '../utils';
import Decimal from 'decimal.js';
import { ValueAxes, valueAxisIndex } from './chart';
import { buildEventSeries, buildGanttChart, buildLineChart, buildCurrentDateLine, euroEntryLines, referenceLines } from './series';

export function convertMoneyCharts(series: any, moneyCharts: any, toCurrency: any, toMagnitude: any) {
  series.forEach((series: any) => {
    if (moneyCharts.includes(series.name)) {
      series.data = series.data.map((item: any) => {
        const change = convertCurrency(item.content?.change ?? 0, item.content.unit, toCurrency);
        const value = convertCurrency(item.value[1], item.content.unit, toCurrency);

        return {
          content: {
            ...item.content,
            ...{
              change: change,
              unit: toCurrency,
              value: value,
            },
          },
          value: [item.value[0], value],
        };
      });

      series.data = series.data.map((item: any) => {
        const value = new Decimal(item.value[1]).dividedBy(parseInt(toMagnitude)).toNumber();

        return {
          content: {
            ...item.content,
            ...{
              change: new Decimal(item.content.change).dividedBy(parseInt(toMagnitude)).toNumber(),
              magnitude: parseInt(toMagnitude),
              value: value,
            },
          },
          value: [item.value[0], value],
        };
      });
    }
  });

  return series;
}

export function buildSeries(
  events: any,
  gantt: any,
  charts: any,
  view: { showLabels: boolean; smallPoints: boolean; axes: ValueAxes },
  euroEntries: readonly number[]
) {
  const { showLabels, smallPoints, axes } = view;
  const series: any = [];

  series.push(buildCurrentDateLine());
  series.push(buildCurrentDateLine(1));
  series.push(...referenceLines(axes));

  events.forEach((event: any) => {
    series.push(buildEventSeries(event, 0));
    series.push(buildEventSeries(event, 1));
  });

  /* After the events: an entry can share an event's date (Slovenia's is Bulgaria's in the EU), and at one z the later series is on top. */
  series.push(...euroEntryLines(euroEntries));

  charts.forEach((chart: any) => {
    series.push(buildLineChart(chart, showLabels, smallPoints, 1, valueAxisIndex(chart.unit)));
  });

  series.push(buildGanttChart(gantt.data, gantt.metadata.styles, 0));

  return series;
}
