import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LucideArrowUpRight, LucideBookOpen, LucideChevronDown, LucideGlobe, LucidePlus, LucideX } from '@lucide/angular';
import { periodDates, periodDuration, periodSpan, roundDuration } from '../../services/chart/series';

interface SourceRow {
  name: string;
  url: string;
  site: string;
  isWiki: boolean;
  quote?: string;
  quoteOriginal?: string;
}

function toSourceRow(source: any): SourceRow {
  const url: string = source.url[0];
  const site = new URL(url).hostname.split('.').slice(-2)[0];

  return { name: source.name, url, site, isWiki: site === 'wikipedia', quote: source.quote, quoteOriginal: source.quoteOriginal };
}

function dates(period: any): { dates: string; duration: string } {
  const { from, to } = periodSpan(period);

  return { dates: periodDates(period.date, from, to), duration: periodDuration(period.date, from, to) };
}

/** The picked period of a country: its dates, the country's other currencies, and the sources. */
@Component({
  selector: 'app-detail-panel',
  imports: [NgTemplateOutlet, LucideArrowUpRight, LucideBookOpen, LucideChevronDown, LucideGlobe, LucidePlus, LucideX],
  templateUrl: './detail-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailPanelComponent {
  readonly country = input.required<any>();
  readonly periodIndex = input.required<number>();
  /** Whether the country is among those chosen in the search. */
  readonly selected = input.required<boolean>();
  readonly periodSelected = output<number>();
  readonly selectionToggled = output<void>();

  protected readonly currenciesOpen = signal(true);
  protected readonly period = computed(() => this.country().periods[this.periodIndex()]);
  protected readonly span = computed(() => dates(this.period()));
  protected readonly flag = computed(() => this.period().flag.toLowerCase());
  protected readonly sources = computed<SourceRow[]>(() => (this.period().sources ?? []).map(toSourceRow));

  /* Newest first: the euro or the currency in use leads. */
  protected readonly currencies = computed(() =>
    this.country()
      .periods.map((period: any, index: number) => ({
        index,
        // The dataset names a Eurozone period after the country, and styles only the national currencies.
        name: period.style ? period.name : 'Евро',
        flag: period.flag.toLowerCase(),
        dates: dates(period).dates,
        duration: roundDuration(periodSpan(period).from, periodSpan(period).to),
      }))
      .reverse()
  );

  constructor() {
    // A newly picked country opens with its currencies showing, however the last one was left.
    effect(() => {
      this.country();
      this.currenciesOpen.set(true);
    });
  }
}
