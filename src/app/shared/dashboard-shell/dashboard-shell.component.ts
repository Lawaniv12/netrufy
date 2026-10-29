import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { Component, inject, Input, signal, TemplateRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

export interface DashboardNavItem {
  label: string;
  route: string;
  fragment?: string;
  active?: boolean;
  badge?: string;
  divider?: boolean;
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

        <nav aria-label="Workspace navigation" class="flex-1 space-y-1 overflow-y-auto px-3 py-4" [class.!px-2]="sidebarCollapsed()">
          @for (item of workspaceNavItems; track item.label) {
            @if (item.divider) {
              @if (!sidebarCollapsed()) {
                <p class="mb-1 mt-5 border-t border-netrust-line px-3 pt-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-netrust-muted">{{ item.label }}</p>
              } @else {
                <div class="my-3 border-t border-netrust-line" aria-hidden="true"></div>
              }
            } @else {
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
          }
        </nav>

      </aside>

      <div [ngClass]="sidebarCollapsed() ? 'lg:pl-16' : 'lg:pl-64'">
        <header class="sticky top-[var(--topbar-height)] z-20 border-b border-netrust-line bg-white/90 backdrop-blur-xl">
          <div class="mx-auto max-w-[1600px] px-5 sm:px-7 lg:px-9">
            <div class="flex min-h-[104px] items-center justify-between gap-4 py-4">
              <div class="flex min-w-0 items-center gap-4">
                <button type="button" class="dashboard-nav-toggle hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-netrust-line bg-white text-netrust-ink shadow-none lg:flex" [attr.aria-expanded]="!sidebarCollapsed()" [attr.aria-label]="sidebarCollapsed() ? 'Expand workspace navigation' : 'Collapse workspace navigation'" [title]="sidebarCollapsed() ? 'Expand navigation' : 'Collapse navigation'" (click)="toggleSidebar()">
                  <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
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
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-netrust-paper text-xs font-bold text-netrust-green">{{ userInitials || initials(userName || supabase.profile()?.full_name || 'Member') }}</div>
                  <div class="hidden text-left sm:block">
                    <p class="text-xs font-semibold text-slate-700">{{ userName || supabase.profile()?.full_name || 'Member' }}</p>
                    <p class="text-[10px] uppercase tracking-[0.12em] text-slate-500">{{ userRole || supabase.profile()?.role || 'Member' }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        @if (workspaceNavItems.length) {
          <nav aria-label="Workspace navigation" class="flex gap-1.5 overflow-x-auto border-b border-netrust-line bg-white px-4 py-2 lg:hidden">
            @for (item of workspaceNavItems; track item.label) {
              @if (!item.divider) {
                <a
                  [routerLink]="item.route"
                  [fragment]="item.fragment"
                  [class]="isActive(item) ? 'bg-netrust-paper text-netrust-green' : 'text-slate-600'"
                  class="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold"
                >{{ item.label }}</a>
              }
            }
          </nav>
        }

        <main class="mx-auto max-w-[1600px] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
          <ng-content></ng-content>
        </main>
      </div>
    </div>
  `,
})
export class DashboardShellComponent {
  private readonly router = inject(Router);
  readonly supabase = inject(SupabaseService);
  readonly sidebarCollapsed = signal(false);
  @Input() title = 'Dashboard';
  @Input() subtitle = '';
  @Input() badge = 'Overview';
  @Input() communityName = 'Community';
  @Input() userName = '';
  @Input() userRole = '';
  @Input() userInitials = '';
  @Input() navItems: DashboardNavItem[] = [];
  @Input() actions: TemplateRef<unknown> | null = null;

  get workspaceNavItems(): DashboardNavItem[] {
    const role = this.supabase.profile()?.role;
    const items: DashboardNavItem[] = [
      { label: 'Directory', route: '/directory' },
    ];
    if (role === 'member' || role === 'community_admin') {
      items.push({ label: 'Messages', route: '/messages' });
    }
    items.push(
      { label: 'My profile', route: '/profile' },
      { label: 'Trust', route: '/trust' },
    );
    if (this.supabase.canAccessUnitAdmin()) items.push({ label: 'Unit admin', route: '/unit-admin' });
    if (role === 'community_admin' || role === 'platform_admin') items.push({ label: 'Admin', route: '/admin' });
    if (this.navItems.length) items.push({ label: 'Page sections', route: '', divider: true }, ...this.navItems);
    return items;
  }

  toggleSidebar() {
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  }

  isActive(item: DashboardNavItem): boolean {
    const current = this.router.parseUrl(this.router.url);
    const segments = current.root.children['primary']?.segments ?? [];
    const currentPath = `/${segments.map((segment) => segment.path).join('/')}`;
    if (currentPath !== item.route) return false;
    if (!item.fragment) return true;
    const defaultFragment = this.navItems.find((navItem) => navItem.fragment)?.fragment;
    return (current.fragment ?? defaultFragment) === item.fragment;
  }
}
