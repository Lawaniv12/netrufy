import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-[0_10px_25px_rgba(15,23,42,0.02)]">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf3ef] text-2xl text-[#275b43]">•</div>
      <h3 class="mt-4 text-xl font-semibold tracking-tight text-slate-900">{{ title }}</h3>
      <p class="mt-2 text-sm text-slate-500">{{ message }}</p>
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() title = 'Nothing here yet';
  @Input() message = 'This section is empty right now.';
}
