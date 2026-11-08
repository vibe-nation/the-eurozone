import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';

export interface EventToggle {
  id: string;
  label: string;
  color: string;
  shown: boolean;
}

/* It stays open across ticks, so several can be switched in one go. */
@Component({
  selector: 'app-events-menu',
  templateUrl: './events-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class EventsMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly toggles = input.required<readonly EventToggle[]>();
  readonly toggled = output<string>();

  protected readonly open = signal(false);
  protected readonly shownCount = computed(() => this.toggles().filter((toggle) => toggle.shown).length);

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected close(): void {
    this.open.set(false);
  }
}
