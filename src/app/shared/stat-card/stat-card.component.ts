import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type StatCardTone = 'green' | 'blue' | 'amber' | 'slate';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_25px_rgba(15,23,42,0.04)]">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">{{ label }}</p>
          <p class="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{{ value }}</p>
        </div>
        <div class="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold" [ngClass]="toneClasses[tone]">
          {{ icon }}
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between gap-3">
        <p class="text-sm text-slate-500">{{ description }}</p>
        @if (delta) {
          <span class="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold" [ngClass]="deltaClasses[tone]">
            {{ delta }}
          </span>
        }
      </div>
    </div>
  `,
})
export class StatCardComponent {
  @Input() label = 'Members';
  @Input() value = '0';
  @Input() description = 'Across your community';
  @Input() delta = '';
  @Input() icon = '•';
  @Input() tone: StatCardTone = 'green';

  readonly toneClasses: Record<StatCardTone, string> = {
    green: 'bg-[#edf3ef] text-[#275b43]',
    blue: 'bg-[#eef2ef] text-[#315b48]',
    amber: 'bg-[#fff4dd] text-[#a46d00]',
    slate: 'bg-[#f1f5f9] text-slate-700',
  };

  readonly deltaClasses: Record<StatCardTone, string> = {
    green: 'bg-[#edf3ef] text-[#275b43]',
    blue: 'bg-[#eef2ef] text-[#315b48]',
    amber: 'bg-[#fff4dd] text-[#a46d00]',
    slate: 'bg-[#f1f5f9] text-slate-700',
  };
}
