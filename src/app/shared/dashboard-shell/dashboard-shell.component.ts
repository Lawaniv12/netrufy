import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { Component, inject, Input, TemplateRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

export interface DashboardNavItem {
  label: string;
  route: string;
  fragment?: string;
  active?: boolean;
  badge?: string;
}

@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, NgTemplateOutlet],
  template: `
    <div class="dashboard-shell min-h-[calc(100vh-var(--topbar-height))] bg-[#f5f6f0] text-slate-900">
      <aside class="fixed bottom-0 left-0 top-[var(--topbar-height)] z-10 hidden w-64 border-r border-slate-200 bg-[#fffefa] lg:flex lg:flex-col">
        <div class="border-b border-slate-200 px-5 py-5">
          <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <p class="mt-1 text-sm font-semibold text-slate-800">{{ communityName }}</p>
        </div>

        <nav aria-label="Workspace navigation" class="flex-1 space-y-1 px-3 py-4">
          @for (item of navItems; track item.label) {
            <a
              [routerLink]="item.route"
              [fragment]="item.fragment"
              [class]="isActive(item) ? 'bg-[#eaf1e9] text-[#1d4935] before:bg-[#275b43]' : 'text-slate-600 before:bg-transparent hover:bg-slate-50 hover:text-slate-900'"
              class="relative flex min-h-10 items-center justify-between rounded-md px-3 pl-4 text-[13px] font-semibold transition-colors before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full"
            >
              <span>{{ item.label }}</span>
              @if (item.badge) {
                <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{{ item.badge }}</span>
              }
            </a>
          }
        </nav>

        <div class="border-t border-slate-200 p-4">
          <div class="rounded-md border border-slate-200 bg-[#f7f8f4] p-3">
            <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Community</p>
            <p class="mt-1 truncate text-sm font-semibold text-slate-800">{{ communityName }}</p>
          </div>
        </div>
      </aside>

      <div class="lg:pl-64">
        <header class="sticky top-[var(--topbar-height)] z-20 border-b border-slate-200 bg-[#fffefa]/95 backdrop-blur-xl">
          <div class="mx-auto max-w-[1600px] px-5 sm:px-7 lg:px-9">
            <div class="flex min-h-[104px] items-center justify-between gap-4 py-4">
              <div>
                <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#275b43]">{{ badge }}</p>
                <h1 class="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">{{ title }}</h1>
                @if (subtitle) {
                  <p class="mt-1 text-sm text-slate-500">{{ subtitle }}</p>
                }
              </div>

              <div class="flex items-center gap-3">
                @if (actions) {
                  <div class="hidden items-center gap-2 sm:flex">
                    <ng-container [ngTemplateOutlet]="actions"></ng-container>
                  </div>
                }
                <div class="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaf1e9] text-xs font-bold text-[#275b43]">{{ userInitials }}</div>
                  <div class="hidden text-left sm:block">
                    <p class="text-xs font-semibold text-slate-700">{{ userName }}</p>
                    <p class="text-[10px] uppercase tracking-[0.12em] text-slate-500">{{ userRole }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <nav aria-label="Workspace sections" class="flex gap-1 overflow-x-auto border-b border-slate-200 bg-[#fffefa] px-4 py-2 lg:hidden">
          @for (item of navItems; track item.label) {
            <a
              [routerLink]="item.route"
              [fragment]="item.fragment"
              [class]="isActive(item) ? 'bg-[#eaf1e9] text-[#1d4935]' : 'text-slate-600'"
              class="shrink-0 rounded-md px-3 py-2 text-xs font-semibold"
            >{{ item.label }}</a>
          }
        </nav>

        <main class="mx-auto max-w-[1600px] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
          <ng-content></ng-content>
        </main>
      </div>
    </div>
  `,
})
export class DashboardShellComponent {
  private readonly router = inject(Router);
  @Input() title = 'Dashboard';
  @Input() subtitle = '';
  @Input() badge = 'Overview';
  @Input() communityName = 'Community';
  @Input() userName = 'Member';
  @Input() userRole = 'Member';
  @Input() userInitials = 'M';
  @Input() navItems: DashboardNavItem[] = [];
  @Input() actions: TemplateRef<unknown> | null = null;

  isActive(item: DashboardNavItem): boolean {
    const current = this.router.parseUrl(this.router.url);
    const currentFragment = current.fragment ?? 'overview';
    return currentFragment === (item.fragment ?? 'overview');
  }
}
