import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  at: string;
  tone?: 'green' | 'blue' | 'amber' | 'slate';
}

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="dashboard-card rounded-lg border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(23,37,31,0.045)]">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Activity</p>
          <h2 class="mt-1 text-xl font-semibold tracking-tight text-slate-900">Recent updates</h2>
        </div>
      </div>

      @if (items.length) {
      <ul class="space-y-3">
        @for (item of items; track item.id) {
          <li class="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
              [ngClass]="{
                'bg-netrust-paper text-netrust-green': item.tone === 'green',
                'bg-[#edf2fb] text-[#2857bd]': item.tone === 'blue',
                'bg-[#fff4df] text-[#8b5a0b]': item.tone === 'amber',
                'bg-slate-200 text-slate-700': !item.tone || item.tone === 'slate'
              }">
              {{ item.title.charAt(0).toUpperCase() }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-800">{{ item.title }}</p>
              <p class="mt-1 text-sm text-slate-500">{{ item.detail }}</p>
            </div>
            <time [attr.datetime]="item.at" class="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">{{ relativeTime(item.at) }}</time>
          </li>
        }
      </ul>
      } @else {
        <p class="border-t border-slate-100 pt-4 text-sm text-slate-500">No recent activity yet.</p>
      }
    </section>
  `,
})
export class ActivityFeedComponent {
  @Input() items: ActivityItem[] = [];

  relativeTime(value: string): string {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return '';
    const elapsed = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
