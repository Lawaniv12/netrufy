import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { Component, inject, Input, signal, TemplateRef } from '@angular/core';
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
    <div class="dashboard-shell min-h-[calc(100vh-var(--topbar-height))] bg-netrust-paper text-netrust-ink">
      <aside [ngClass]="sidebarCollapsed() ? 'lg:w-16' : 'lg:w-64'" class="fixed bottom-0 left-0 top-[var(--topbar-height)] z-10 hidden border-r border-netrust-line bg-white transition-[width] duration-200 lg:flex lg:flex-col">
        <div class="border-b border-netrust-line px-5 py-5" [class.!px-3]="sidebarCollapsed()">
          @if (!sidebarCollapsed()) {
            <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-netrust-muted">Workspace</p>
            <p class="mt-1 truncate text-sm font-semibold text-netrust-ink">{{ communityName }}</p>
          } @else {
            <p class="text-center text-sm font-extrabold text-netrust-green" [title]="communityName">{{ communityName.charAt(0) }}</p>
          }
        </div>

        <nav aria-label="Workspace navigation" class="flex-1 space-y-1 px-3 py-4" [class.!px-2]="sidebarCollapsed()">
          @for (item of navItems; track item.label) {
            <a
              [routerLink]="item.route"
              [fragment]="item.fragment"
              [attr.title]="sidebarCollapsed() ? item.label : null"
              [attr.aria-label]="item.label"
              [class]="isActive(item) ? 'bg-netrust-paper text-netrust-green before:bg-netrust-green' : 'text-slate-600 before:bg-transparent hover:bg-slate-50 hover:text-slate-900'"
              [ngClass]="sidebarCollapsed() ? 'justify-center px-0' : 'justify-between px-3 pl-4'"
              class="relative flex min-h-10 items-center rounded-lg text-[13px] font-semibold transition-colors before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full"
            >
              @if (sidebarCollapsed()) {
                <span aria-hidden="true" class="text-xs font-extrabold">{{ item.label.slice(0, 1) }}</span>
              } @else {
                <span>{{ item.label }}</span>
                @if (item.badge) {
                  <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{{ item.badge }}</span>
                }
              }
            </a>
          }
        </nav>

      </aside>

      <div [ngClass]="sidebarCollapsed() ? 'lg:pl-16' : 'lg:pl-64'">
        <header class="sticky top-[var(--topbar-height)] z-20 border-b border-netrust-line bg-white/90 backdrop-blur-xl">
          <div class="mx-auto max-w-[1600px] px-5 sm:px-7 lg:px-9">
            <div class="flex min-h-[104px] items-center justify-between gap-4 py-4">
              <div class="flex min-w-0 items-center gap-4">
                <button type="button" class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-netrust-line bg-white text-netrust-ink shadow-none hover:bg-netrust-paper lg:flex" [attr.aria-expanded]="!sidebarCollapsed()" [attr.aria-label]="sidebarCollapsed() ? 'Expand workspace navigation' : 'Collapse workspace navigation'" [title]="sidebarCollapsed() ? 'Expand navigation' : 'Collapse navigation'" (click)="toggleSidebar()">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m5-11 2.5 3L14 15"/></svg>
                </button>
                <div class="min-w-0">
                  <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-netrust-green">{{ badge }}</p>
                  <h1 class="mt-1 truncate text-[26px] font-semibold tracking-tight text-netrust-ink sm:text-[30px]">{{ title }}</h1>
                  @if (subtitle) {
                    <p class="mt-1 text-sm text-netrust-muted">{{ subtitle }}</p>
                  }
                </div>
              </div>

              <div class="flex items-center gap-3">
                @if (actions) {
                  <div class="hidden items-center gap-2 sm:flex">
                    <ng-container [ngTemplateOutlet]="actions"></ng-container>
                  </div>
                }
                <div class="flex items-center gap-2.5 rounded-lg border border-netrust-line bg-white px-3 py-2">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-netrust-paper text-xs font-bold text-netrust-green">{{ userInitials }}</div>
                  <div class="hidden text-left sm:block">
                    <p class="text-xs font-semibold text-slate-700">{{ userName }}</p>
                    <p class="text-[10px] uppercase tracking-[0.12em] text-slate-500">{{ userRole }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <nav aria-label="Workspace sections" class="flex gap-1 overflow-x-auto border-b border-netrust-line bg-white px-4 py-2 lg:hidden">
          @for (item of navItems; track item.label) {
            <a
              [routerLink]="item.route"
              [fragment]="item.fragment"
              [class]="isActive(item) ? 'bg-netrust-paper text-netrust-green' : 'text-slate-600'"
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
  readonly sidebarCollapsed = signal(false);
  @Input() title = 'Dashboard';
  @Input() subtitle = '';
  @Input() badge = 'Overview';
  @Input() communityName = 'Community';
  @Input() userName = 'Member';
  @Input() userRole = 'Member';
  @Input() userInitials = 'M';
  @Input() navItems: DashboardNavItem[] = [];
  @Input() actions: TemplateRef<unknown> | null = null;

  toggleSidebar() {
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  isActive(item: DashboardNavItem): boolean {
    const current = this.router.parseUrl(this.router.url);
    const currentFragment = current.fragment ?? 'overview';
    return currentFragment === (item.fragment ?? 'overview');
  }
}
