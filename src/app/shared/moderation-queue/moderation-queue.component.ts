import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export interface ModerationQueueItem {
  id: string;
  title: string;
  detail: string;
  status: 'open' | 'reviewed' | 'actioned' | 'dismissed';
  severity: 'low' | 'medium' | 'high';
  updatedAt: string;
}

@Component({
  selector: 'app-moderation-queue',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="dashboard-card rounded-lg border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(23,37,31,0.045)]">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Moderation</p>
          <h2 class="mt-1 text-xl font-semibold tracking-tight text-slate-900">Trust & safety queue</h2>
        </div>
      </div>

      <div class="space-y-3">
        @for (item of items; track item.id) {
          <div class="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-slate-800">{{ item.title }}</p>
                <span class="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  [ngClass]="{
                    'bg-netrust-paper text-netrust-green': item.severity === 'low',
                    'bg-[#fff4df] text-[#8b5a0b]': item.severity === 'medium',
                    'bg-[#fde7e7] text-[#b42318]': item.severity === 'high'
                  }">
                  {{ item.severity }}
                </span>
              </div>
              <p class="mt-1 text-sm text-slate-500">{{ item.detail }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{{ item.status }}</span>
              <span class="text-[10px] uppercase tracking-[0.12em] text-slate-400">{{ item.updatedAt }}</span>
            </div>
          </div>
        }
      </div>
    </section>
  `,
})
export class ModerationQueueComponent {
  @Input() items: ModerationQueueItem[] = [];
}
