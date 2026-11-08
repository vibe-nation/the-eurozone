import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';

const RECENT_STORAGE_KEY = 'euro.recentCountries';
const MAX_RECENT = 5;

const tidied = (text: string): string => text.trim().replace(/\s+/g, ' ');
const folded = (text: string): string => tidied(text).toLocaleLowerCase('bg');

/** Whether a name holds every word of the query, in any order. */
const matchesQuery = (name: string, query: string): boolean =>
  folded(query)
    .split(' ')
    .every((word) => folded(name).includes(word));

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) ?? '[]');

    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function storeRecent(recent: readonly string[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    /* Lost on reload; nothing else depends on it. */
  }
}

export interface SearchCountry {
  id: string;
  name: string;
  flag: string;
}

interface SearchOption extends SearchCountry {
  picked: boolean;
  recent: boolean;
}

/* A pick leaves the list open with its text, so several can be made in one go, and
   the same row takes one back. The rows hold still while the list is open, for the
   next click to land where it is aimed: a pick joins the recent ones on show when the
   list next opens. Focus stays in the text: the list's `mousedown` keeps it there, and
   the active row is named by `aria-activedescendant`. */
@Component({
  selector: 'app-country-search',
  templateUrl: './country-search.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'search',
    class: 'relative min-w-0 max-w-80 flex-[1_1_11rem] max-sm:max-w-none max-sm:basis-full',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class CountrySearchComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly countries = input.required<readonly SearchCountry[]>();
  readonly picked = model.required<ReadonlySet<string>>();

  protected readonly text = signal('');
  protected readonly open = signal(false);
  /** Index into `options()`; -1 for none. */
  protected readonly active = signal(-1);
  private readonly recent = signal(readRecent());
  /** The recent picks as the list has them, behind `recent` while it is open. */
  private readonly listedRecent = signal(this.recent());

  private readonly searching = computed(() => tidied(this.text()) !== '');

  protected readonly options = computed<SearchOption[]>(() => {
    const picked = this.picked();
    const rows = this.countries().map((country) => ({ ...country, picked: picked.has(country.id), recent: false }));

    if (this.searching()) {
      return rows.filter((row) => matchesQuery(row.name, this.text()));
    }

    const recent = this.listedRecent().flatMap((id) => rows.find((row) => row.id === id) ?? []);

    return [...recent.map((row) => ({ ...row, recent: true })), ...rows.filter((row) => !recent.includes(row))];
  });

  /** How many recent picks lead the list: the index of the first other row. */
  protected readonly recentCount = computed(() => this.options().filter((option) => option.recent).length);

  /* A list with nothing in it isn't drawn: the field's count speaks alone. */
  protected readonly shown = computed(() => this.open() && this.options().length > 0);
  protected readonly miss = computed(() => this.searching() && !this.options().length);
  protected readonly clearable = computed(() => !!this.text() || this.picked().size > 0);
  protected readonly count = computed(() => {
    if (this.miss()) {
      return 'няма';
    }

    if (this.searching()) {
      return `${this.options().length}`;
    }

    return this.picked().size ? `${this.picked().size} от ${this.countries().length}` : null;
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
    const picks = new Set(this.picked());

    if (!picks.delete(id)) {
      picks.add(id);
      this.addRecent(id);
    }

    this.picked.set(picks);
  }

  /** A pick made outside the list, which is shut by then, so its rows can take the pick at once. */
  remember(id: string): void {
    this.addRecent(id);
    this.listedRecent.set(this.recent());
  }

  protected clear(): void {
    this.text.set('');
    this.picked.set(new Set());
    this.active.set(-1);
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
    storeRecent(recent);
  }
}
