import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideArrowUpRight } from '@lucide/angular';
import { PointCard } from '../../services/chart/point-card';

/** A clicked point of a line: its reading, the change from the period before, and where the figure comes from. */
@Component({
  selector: 'app-point-panel',
  imports: [LucideArrowUpRight],
  templateUrl: './point-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointPanelComponent {
  readonly card = input.required<PointCard>();
}
