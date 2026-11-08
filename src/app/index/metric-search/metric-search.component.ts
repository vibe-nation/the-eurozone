import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { Metric, metricLabel } from '../../services/chart/metrics';
import { matchesQuery, readRecent, storeRecent, tidied } from '../country-search/country-search.component';

const RECENT_STORAGE_KEY = 'euro.recentMetrics';
/* Of six metrics: more and the list would be nearly all recent. */
const MAX_RECENT = 3;

interface MetricOption {
  id: string;
  label: string;
  picked: boolean;
  recent: boolean;
}

/* The country search's combobox, over metrics. A pick leaves the list open, and the
   same row takes one back. The rows hold still while the list is open: a pick joins
   the recent ones on show when the list next opens. */
@Component({
  selector: 'app-metric-search',
  templateUrl: './metric-search.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'search',
    class: 'relative min-w-0 max-w-80 flex-[1_1_11rem] max-sm:max-w-none max-sm:basis-full',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class MetricSearchComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly metrics = input.required<readonly Metric[]>();
  readonly picked = input.required<ReadonlySet<string>>();
  readonly toggled = output<string>();
  /** Asks for the selection back at its default, the first metric. */
  readonly cleared = output<void>();

  protected readonly text = signal('');
  protected readonly open = signal(false);
  /** Index into `options()`; -1 for none. */
  protected readonly active = signal(-1);
  private readonly recent = signal(readRecent(RECENT_STORAGE_KEY, MAX_RECENT));
  /** The recent picks as the list has them, behind `recent` while it is open. */
  private readonly listedRecent = signal(this.recent());

  private readonly searching = computed(() => tidied(this.text()) !== '');

  protected readonly options = computed<MetricOption[]>(() => {
    const rows = this.metrics().map((metric) => ({ id: metric.id, label: metricLabel(metric), picked: this.picked().has(metric.id), recent: false }));

    if (this.searching()) {
      return rows.filter((row) => matchesQuery(row.label, this.text()));
    }

    const recent = this.listedRecent().flatMap((id) => rows.find((row) => row.id === id) ?? []);

    return [...recent.map((row) => ({ ...row, recent: true })), ...rows.filter((row) => !recent.includes(row))];
  });

  /** How many recent picks lead the list: the index of the first other row. */
  protected readonly recentCount = computed(() => this.options().filter((option) => option.recent).length);

  protected readonly shown = computed(() => this.open() && this.options().length > 0);
  protected readonly miss = computed(() => this.searching() && !this.options().length);
  /* A chart always has a metric, so the default alone is nothing to clear. */
  protected readonly clearable = computed(() => !!this.text() || this.picked().size > 1 || !this.picked().has(this.metrics()[0].id));
  protected readonly count = computed(() => {
    if (this.miss()) {
      return 'няма';
    }

    return this.searching() ? `${this.options().length}` : `${this.picked().size} от ${this.metrics().length}`;
  });

  protected openList(): void {
    this.open.set(true);
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
    this.open.set(true);
    this.active.set(-1);
  }

  protected pick(id: string): void {
    if (!this.picked().has(id)) {
      this.addRecent(id);
    }

    this.toggled.emit(id);
  }

  protected clear(): void {
    this.text.set('');
    this.active.set(-1);
    this.cleared.emit();
  }

  protected forgetRecent(): void {
    this.setRecent([]);
    this.listedRecent.set([]);
    this.active.set(-1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.step(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      const options = this.options();
      /* With text that leaves one row, that row is what Enter means. */
      const target = options[this.active()] ?? (this.searching() && options.length === 1 ? options[0] : null);

      if (target) {
        this.pick(target.id);
      }
    } else if (event.key === 'Escape') {
      this.dismiss(event);
    }
  }

  /* One Escape, one dismissal: the list, then the text. With neither left it goes on to the page, whose Escape shuts the panel. */
  private dismiss(event: Event): void {
    if (this.shown()) {
      this.close();
    } else if (this.text()) {
      this.text.set('');
    } else {
      return;
    }

    event.stopPropagation();
  }

  /* From nothing active, down enters at the top and up at the bottom. */
  private step(delta: 1 | -1): void {
    const count = this.options().length;

    if (!count) {
      return;
    }

    this.open.set(true);

    const from = this.active();
    const next = from === -1 ? (delta === 1 ? 0 : count - 1) : (from + delta + count) % count;

    this.active.set(next);
    this.host.nativeElement.querySelectorAll('[role=option]')[next]?.scrollIntoView({ block: 'nearest' });
  }

  protected onDocumentPointerDown(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  /* Tabbing on; a window losing focus has nowhere to go and keeps the list open. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;

    if (next && !this.host.nativeElement.contains(next)) {
      this.close();
    }
  }

  private close(): void {
    this.open.set(false);
    this.active.set(-1);
    this.listedRecent.set(this.recent());
  }

  private addRecent(id: string): void {
    this.setRecent([id, ...this.recent().filter((other) => other !== id)].slice(0, MAX_RECENT));
  }

  private setRecent(recent: readonly string[]): void {
    this.recent.set([...recent]);
    storeRecent(RECENT_STORAGE_KEY, recent);
  }
}
