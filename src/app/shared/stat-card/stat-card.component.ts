import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type StatCardTone = 'green' | 'blue' | 'amber' | 'slate';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard-card rounded-lg border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(23,37,31,0.045)]">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">{{ label }}</p>
          <p class="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{{ value }}</p>
        </div>
        <div class="flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold" [ngClass]="toneClasses[tone]">
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
    green: 'bg-netrust-paper text-netrust-green',
    blue: 'bg-[#edf2fb] text-[#2857bd]',
    amber: 'bg-[#fff4df] text-[#8b5a0b]',
    slate: 'bg-slate-100 text-slate-700',
  };

  readonly deltaClasses: Record<StatCardTone, string> = {
    green: 'bg-netrust-paper text-netrust-green',
    blue: 'bg-[#edf2fb] text-[#2857bd]',
    amber: 'bg-[#fff4df] text-[#8b5a0b]',
    slate: 'bg-slate-100 text-slate-700',
  };
}
