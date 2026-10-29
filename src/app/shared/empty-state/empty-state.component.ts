import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="dashboard-card rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-[0_8px_24px_rgba(23,37,31,0.025)]">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-netrust-paper text-2xl text-netrust-green">•</div>
      <h3 class="mt-4 text-xl font-semibold tracking-tight text-slate-900">{{ title }}</h3>
      <p class="mt-2 text-sm text-slate-500">{{ message }}</p>
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() title = 'Nothing here yet';
  @Input() message = 'This section is empty right now.';
}
