import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export interface ActivityItem {
  title: string;
  detail: string;
  time: string;
  tone?: 'green' | 'blue' | 'amber' | 'slate';
}

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_25px_rgba(15,23,42,0.04)]">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Activity</p>
          <h2 class="mt-1 text-xl font-semibold tracking-tight text-slate-900">Recent updates</h2>
        </div>
      </div>

      <ul class="space-y-3">
        @for (item of items; track item.title + item.time) {
          <li class="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
              [ngClass]="{
                'bg-[#edf3ef] text-[#275b43]': item.tone === 'green',
                'bg-[#eef2ef] text-[#315b48]': item.tone === 'blue',
                'bg-[#fff4dd] text-[#a46d00]': item.tone === 'amber',
                'bg-slate-200 text-slate-700': !item.tone || item.tone === 'slate'
              }">
              {{ item.title.charAt(0).toUpperCase() }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-800">{{ item.title }}</p>
              <p class="mt-1 text-sm text-slate-500">{{ item.detail }}</p>
            </div>
            <time class="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">{{ item.time }}</time>
          </li>
        }
      </ul>
    </section>
  `,
})
export class ActivityFeedComponent {
  @Input() items: ActivityItem[] = [];
}
