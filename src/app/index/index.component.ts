import { ChangeDetectorRef, Component, HostListener, OnInit, ChangeDetectionStrategy, viewChild } from '@angular/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { CustomChart, LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TooltipComponent } from 'echarts/components';
import { ECharts } from 'echarts';
import { DataService } from '../services/data.service';
import { forkJoin } from 'rxjs';
import { convertMoneyCharts, buildSeries } from '../services/chart/utils';
import { CanvasRenderer } from 'echarts/renderers';
import { LucideEuro } from '@lucide/angular';
import { loadData, buildSavePayload } from '../services/utils';
import { ActivatedRoute, Router } from '@angular/router';
import { NARROW_WIDTH_PX, ValueAxes, bigTimeChart, gridLeftPatch, gridRight, valueAxesPatch, timeTickCount } from '../services/chart/chart';
import { METRICS, countryColor, countryOf, isOffered, metricLabel, metricOf } from '../services/chart/metrics';
import { PointCard, pickedPointSeries, pointCard } from '../services/chart/point-card';
import { GANTT_SERIES_ID, euroEntryLines, ganttWithSelection, inMenuOrder, periodSpan, pointStyle, zeroLines } from '../services/chart/series';
import { DetailPanelComponent } from './detail-panel/detail-panel.component';
import { PointPanelComponent } from './point-panel/point-panel.component';
import { CountrySearchComponent, SearchCountry } from './country-search/country-search.component';
import { EventToggle, EventsMenuComponent } from './events-menu/events-menu.component';

echarts.use([GridComponent, CanvasRenderer, LegendComponent, LineChart, CustomChart, DataZoomComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent]);

const DEFAULT_METRIC = METRICS[0].id;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** A country whose current period is the euro: the dataset styles only the national currencies. */
const inEurozone = (row: any): boolean => !row.periods.at(-1).style;

interface PeriodPick {
  rowIndex: number;
  periodIndex: number;
}

/** A country, with its line in each chosen metric. */
interface LegendRow {
  ids: string[];
  name: string;
  color: string;
  shown: boolean;
}

@Component({
  selector: 'app-index',
  imports: [NgxEchartsDirective, LucideEuro, DetailPanelComponent, PointPanelComponent, CountrySearchComponent, EventsMenuComponent],
  templateUrl: './index.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [provideEchartsCore({ echarts })],
})
export class IndexComponent implements OnInit {
  public convert: { currency: string; magnitude: string } = { currency: 'EUR', magnitude: '1000000000' };
  public switches: { [key: string]: boolean } = {};
  public chart!: any;
  public convertableCharts: string[] = [];
  public chartInstance!: ECharts;
  public data: any = {
    timeline: [],
    events: [],
    charts: [],
    settings: { style: {} },
  };

  public metrics = METRICS;
  public metricLabel = metricLabel;
  public magnitudes = [
    { value: '1000000', label: 'млн' },
    { value: '1000', label: 'хил' },
    { value: '1', label: 'единици' },
  ];

  public activeMetrics: ReadonlySet<string> = new Set([DEFAULT_METRIC]);
  public rows: LegendRow[] = [];
  public eventToggles: EventToggle[] = [];
  public hiddenCount = 0;
  public pick: PeriodPick | null = null;
  /** The clicked point of a line. The panel shows this or `pick`, never both. */
  public point: PointCard | null = null;
  public countries: SearchCountry[] = [];
  /** The ids of the countries chosen in the search. */
  public searched: ReadonlySet<string> = new Set();

  private readonly search = viewChild.required(CountrySearchComponent);
  private bars: any[] = [];
  private selection: Record<string, boolean> = {};
  private narrow = window.innerWidth < NARROW_WIDTH_PX;
  private tickCount = 0;

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private dataService: DataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    forkJoin([
      this.dataService.getData('dataset-eurozone.json'),
      this.dataService.getData('events.json'),
      this.dataService.getData('charts.json'),
      this.dataService.getData('settings.json'),
    ]).subscribe({
      next: ([timeline, events, allCharts, settings]) => {
        const charts = allCharts.filter((chart: any) => isOffered(chart.id));

        // Eurozone members first: they are the rows in view, the others are scrolled to.
        this.data.timeline = { ...timeline, data: [...timeline.data.filter(inEurozone), ...timeline.data.filter((row: any) => !inEurozone(row))] };
        this.countries = timeline.data
          .map((row: any) => ({ id: row.id, name: row.name, flag: row.periods.at(-1).flag.toLowerCase() }))
          .sort((a: SearchCountry, b: SearchCountry) => a.name.localeCompare(b.name, 'bg'));
        this.data.events = events;
        this.data.charts = charts;
        this.data.settings = settings;

        const load = loadData(this.activatedRoute.snapshot.queryParamMap.get('story'), settings.default);

        this.convert.currency = load.currency;
        this.convert.magnitude = load.magnitude;
        this.switches = load.switches;

        charts.forEach((chart: any) => {
          if (chart.unit === 'EUR') {
            this.convertableCharts.push(chart.id);
          }
        });

        this.loadChart(events, this.data.timeline, charts, load.legends);
        this.cdr.detectChanges();
      },
      error: () => {},
      complete: () => {},
    });
  }

  loadChart(events: any, gantt: any, charts: any, defaultLegends: string[]): void {
    // A saved link opens on every metric it has a line in, each with all of its countries.
    const saved: any[] = charts.filter((chart: any) => defaultLegends.includes(chart.id));
    const metrics = new Set(saved.flatMap((chart) => metricOf(chart.id)?.id ?? []));

    this.activeMetrics = metrics.size ? metrics : new Set([DEFAULT_METRIC]);

    const selected: Record<string, boolean> = {
      ...Object.fromEntries(events.map((event: any) => [event.id, defaultLegends.includes(event.id)])),
      ...this.linesFor(this.activeMetrics, new Set(saved.map((chart) => countryOf(chart.id)))),
    };

    this.selection = selected;
    this.refreshRows();

    const series = convertMoneyCharts(
      buildSeries(events, gantt, charts, this.seriesView(), []),
      this.convertableCharts,
      this.convert.currency,
      this.convert.magnitude
    );

    this.bars = series.find((item: any) => item.id === GANTT_SERIES_ID).data;

    this.chart = bigTimeChart(
      series,
      gantt.data.map((group: any) => group.name),
      { data: charts.map((chart: any) => chart.id), selected },
      { narrow: this.narrow, visibleRows: gantt.data.filter(inEurozone).length, moneyAxisName: this.moneyAxisName(), ...this.shownAxes() }
    );
  }

  onChartInit(chart: any): void {
    this.chartInstance = chart;
  }

  /** After every render, so zooming, resizing and the panel opening all keep the layout right for the width the chart has. */
  updateChartLayout(): void {
    const axis = (this.chartInstance as any).getModel().getComponent('xAxis', 1).axis;
    const [from, to] = axis.scale.getExtent();
    const [left, right] = axis.getExtent();
    const tickCount = timeTickCount(Math.abs(right - left), (to - from) / MS_PER_YEAR);
    const narrow = this.chartInstance.getWidth() < NARROW_WIDTH_PX;
    const patch: any = {};

    if (tickCount !== this.tickCount) {
      this.tickCount = tickCount;
      patch.xAxis = [{ splitNumber: tickCount }, { splitNumber: tickCount }];
    }

    if (narrow !== this.narrow) {
      this.narrow = narrow;
      patch.grid = [{ right: gridRight(narrow) }, { right: gridRight(narrow) }];
    }

    if (Object.keys(patch).length) {
      // Deferred: this runs inside ECharts' own render, which refuses a nested setOption.
      setTimeout(() => this.chartInstance.setOption(patch));
    }
  }

  /** A click on a bar opens that period; on a country's name, the period it is in now; on a line's point, that reading. */
  onChartClick(event: any): void {
    const rows: any[] = this.data.timeline.data;

    if (event.componentType === 'yAxis') {
      const rowIndex = rows.findIndex((row) => row.name === event.value);

      if (rowIndex >= 0) {
        this.togglePick(rowIndex, rows[rowIndex].periods.length - 1);
      }
    } else if (event.seriesId === GANTT_SERIES_ID) {
      this.togglePick(event.data.content.rowIndex, event.data.content.periodIndex);
    } else if (event.componentType === 'series' && event.seriesType === 'line' && event.data?.content?.date) {
      this.togglePoint(event.seriesName, event.data.content.date);
    }
  }

  selectPeriod(periodIndex: number): void {
    this.setPick({ rowIndex: this.pick!.rowIndex, periodIndex });
  }

  @HostListener('document:keydown.escape')
  closePanel(): void {
    if (this.pick || this.point) {
      this.setPick(null);
    }
  }

  private togglePoint(seriesId: string, date: string): void {
    const isOpen = this.point?.seriesId === seriesId && this.point.date === date;

    this.pick = null;
    this.point = isOpen ? null : this.cardFor(seriesId, date);
    this.drawSelection();
  }

  private cardFor(seriesId: string, date: string): PointCard {
    const chart = this.data.charts.find((item: any) => item.id === seriesId);
    const country = this.countries.find((item) => item.name === countryOf(seriesId));

    return pointCard(chart, date, { ...this.convert, unitName: this.moneyAxisName() }, country?.flag ?? null);
  }

  private togglePick(rowIndex: number, periodIndex: number): void {
    const isOpen = this.pick?.rowIndex === rowIndex && this.pick.periodIndex === periodIndex;

    this.setPick(isOpen ? null : { rowIndex, periodIndex });
  }

  setSearched(searched: ReadonlySet<string>): void {
    this.searched = searched;
    this.drawSelection();
  }

  toggleSearched(id: string): void {
    const searched = new Set(this.searched);

    if (!searched.delete(id)) {
      searched.add(id);
    }

    this.setSearched(searched);
  }

  private setPick(pick: PeriodPick | null): void {
    this.pick = pick;
    this.point = null;
    this.drawSelection();
  }

  private drawSelection(): void {
    this.chartInstance.setOption({ series: this.selectionSeries() });
  }

  private selectionSeries(): any[] {
    return [{ id: GANTT_SERIES_ID, data: ganttWithSelection(this.bars, this.pick, this.searchedRows()) }, ...euroEntryLines(this.euroEntries()), pickedPointSeries(this.point)];
  }

  private searchedRows(): Set<number> {
    const rows: any[] = this.data.timeline.data;

    return new Set(rows.flatMap((row, index) => (this.searched.has(row.id) ? [index] : [])));
  }

  /** When the picked and searched countries joined the eurozone; those outside it have no date. Founders share one. */
  private euroEntries(): number[] {
    const rows: any[] = this.data.timeline.data;
    const selected = [...this.searchedRows(), ...(this.pick ? [this.pick.rowIndex] : [])].map((index) => rows[index]);

    return [...new Set(selected.filter(inEurozone).map((row) => periodSpan(row.periods.at(-1)).from))];
  }

  toggleRow(id: string): void {
    this.applySelection({ ...this.selection, [id]: !this.selection[id] });
  }

  /** Switched on in the legend, a country is selected as the search selects it; switched off, it is let go. */
  toggleCountry(row: LegendRow): void {
    const searched = this.withSearched([row], !row.shown);

    [...searched].filter((id) => !this.searched.has(id)).forEach((id) => this.search().remember(id));
    this.applySelection({ ...this.selection, ...this.switched([row], !row.shown) }, searched);
  }

  /** Hiding all lets go of the countries that were on show; showing all selects none, as every row would be lit. */
  showAll(shown: boolean): void {
    const onShow = this.rows.filter((row) => row.shown);

    this.applySelection({ ...this.selection, ...this.switched(this.rows, shown) }, shown ? undefined : this.withSearched(onShow, false));
  }

  private switched(rows: LegendRow[], shown: boolean): Record<string, boolean> {
    return Object.fromEntries(rows.flatMap((row) => row.ids.map((id) => [id, shown])));
  }

  /** By name: a legend row is a series and a search pick a timeline row, and the name is what they share. */
  private withSearched(rows: LegendRow[], on: boolean): ReadonlySet<string> {
    const names = new Set(rows.map((row) => row.name));
    const searched = new Set(this.searched);

    this.countries
      .filter((country) => names.has(country.name))
      .forEach((country) => {
        if (on) {
          searched.add(country.id);
        } else {
          searched.delete(country.id);
        }
      });

    return searched;
  }

  highlightRow(row: LegendRow, on: boolean): void {
    if (row.shown) {
      this.chartInstance.dispatchAction({ type: on ? 'highlight' : 'downplay', seriesName: row.ids });
    }
  }

  setMagnitude(magnitude: string): void {
    if (magnitude !== this.convert.magnitude) {
      this.convert.magnitude = magnitude;
      this.convertChart();
    }
  }

  toggleNumbers(): void {
    this.switches['labels'] = !this.switches['labels'];
    this.patchLines({ label: { show: !!this.switches['labels'] } });
    this.save();
  }

  toggleSmallPoints(): void {
    this.switches['smallPoints'] = !this.switches['smallPoints'];
    this.patchLines(pointStyle(!!this.switches['smallPoints']));
    this.save();
  }

  /** The chosen countries carry over to the new set of metrics. The last metric stays on: without one the legend has no rows to choose from. */
  toggleMetric(metric: string): void {
    const metrics = new Set(this.activeMetrics);

    if (!metrics.delete(metric)) {
      metrics.add(metric);
    }

    if (metrics.size) {
      const countries = new Set(this.rows.filter((row) => row.shown).map((row) => row.name));

      this.activeMetrics = metrics;
      this.applySelection({ ...this.selection, ...this.linesFor(metrics, countries) });
    }
  }

  /** Every line's state: on for these countries in these metrics, off for the rest. */
  private linesFor(metrics: ReadonlySet<string>, countries: ReadonlySet<string>): Record<string, boolean> {
    return Object.fromEntries(this.data.charts.map((chart: any) => [chart.id, this.inActive(chart.id, metrics) && countries.has(countryOf(chart.id))]));
  }

  private inActive(seriesId: string, metrics: ReadonlySet<string>): boolean {
    const metric = metricOf(seriesId);

    return !!metric && metrics.has(metric.id);
  }

  private applySelection(selection: Record<string, boolean>, searched?: ReadonlySet<string>): void {
    this.selection = selection;
    this.searched = searched ?? this.searched;
    this.refreshRows();

    const axes = this.shownAxes();
    const rowNames: string[] = this.data.timeline.data.map((row: any) => row.name);
    // A panel can't stay open on a line that has left the chart.
    const pointGone = !!this.point && !selection[this.point.seriesId];

    if (pointGone) {
      this.point = null;
    }

    this.chartInstance.setOption({
      legend: { selected: selection },
      yAxis: valueAxesPatch(axes),
      grid: gridLeftPatch(rowNames, axes),
      series: [...zeroLines(axes), ...(searched || pointGone ? this.selectionSeries() : [])],
    });
    this.save();
  }

  private refreshRows(): void {
    const idsByCountry = new Map<string, string[]>();

    this.data.charts
      .filter((chart: any) => this.inActive(chart.id, this.activeMetrics))
      .forEach((chart: any) => {
        const name = countryOf(chart.id);

        idsByCountry.set(name, [...(idsByCountry.get(name) ?? []), chart.id]);
      });

    this.rows = [...idsByCountry]
      .map(([name, ids]) => ({ ids, name, color: countryColor(name), shown: ids.some((id) => this.selection[id]) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'bg'));

    this.hiddenCount = this.rows.filter((row) => !row.shown).length;

    this.eventToggles = inMenuOrder(this.data.events).map((event) => ({
      id: event.id,
      label: event.items[0].name,
      color: event.meta.style.itemStyle.color,
      shown: !!this.selection[event.id],
    }));
  }

  private shownAxes(): ValueAxes {
    const units = new Set(this.data.charts.filter((chart: any) => this.selection[chart.id]).map((chart: any) => chart.unit));

    return { percent: units.has('percent'), index: units.has('index'), money: units.has('EUR') };
  }

  private seriesView() {
    return { showLabels: !!this.switches['labels'], smallPoints: !!this.switches['smallPoints'], axes: this.shownAxes() };
  }

  private moneyAxisName(): string {
    const magnitude = this.convert.magnitude === '1' ? '' : `${this.magnitudes.find((item) => item.value === this.convert.magnitude)?.label} `;

    return `${magnitude}${this.convert.currency}`;
  }

  private convertChart(): void {
    const series = convertMoneyCharts(
      buildSeries(this.data.events, this.data.timeline, this.data.charts, this.seriesView(), this.euroEntries()),
      this.convertableCharts,
      this.convert.currency,
      this.convert.magnitude
    );
    const gantt = series.find((item: any) => item.id === GANTT_SERIES_ID);

    gantt.data = ganttWithSelection(gantt.data, this.pick, this.searchedRows());
    // An open reading follows the new magnitude, in the panel and on the chart.
    this.point = this.point && this.cardFor(this.point.seriesId, this.point.date);
    this.chartInstance.setOption({ series: [...series, pickedPointSeries(this.point)], yAxis: [{}, {}, {}, { name: this.moneyAxisName() }] });
    this.save();
  }

  /** Applies a change to every data line; the other line series only carry marks. */
  private patchLines(patch: object): void {
    const series = this.chartInstance.getOption()['series'] as any[];

    this.chartInstance.setOption({
      series: series.map((item) => (item.type === 'line' && item.data?.length ? patch : {})),
    });
  }

  private save(): void {
    this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: {
        story: buildSavePayload(this.chartInstance.getOption(), this.switches, this.convert),
      },
    });
  }
}
