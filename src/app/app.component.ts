import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { SupabaseService } from './core/services/supabase.service';

const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly supabase = inject(SupabaseService);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly navigationLoading = signal(false);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private navigationTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly navigationSubscription: Subscription;
  private readonly activityEvents = ['click', 'keydown', 'pointerdown', 'pointermove', 'scroll', 'touchstart', 'touchmove'] as const;

  constructor() {
    this.navigationSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.clearNavigationTimer();
        this.navigationTimer = setTimeout(() => this.navigationLoading.set(true), 120);
      } else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.clearNavigationTimer();
        this.navigationLoading.set(false);
      }
    });

    for (const eventName of this.activityEvents) {
      window.addEventListener(eventName, this.onUserActivity, { passive: true });
    }

    this.resetInactivityTimer();

    this.destroyRef.onDestroy(() => {
      for (const eventName of this.activityEvents) {
        window.removeEventListener(eventName, this.onUserActivity);
      }
      this.clearInactivityTimer();
      this.clearNavigationTimer();
      this.navigationSubscription.unsubscribe();
    });
  }

  private readonly onUserActivity = () => {
    if (!this.supabase.isAuthed()) {
      this.clearInactivityTimer();
      return;
    }

    this.resetInactivityTimer();
  };

  private clearInactivityTimer() {
    if (this.inactivityTimer !== null) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private clearNavigationTimer() {
    if (this.navigationTimer !== null) {
      clearTimeout(this.navigationTimer);
      this.navigationTimer = null;
    }
  }

  private resetInactivityTimer() {
    if (!this.supabase.isAuthed()) {
      this.clearInactivityTimer();
      return;
    }

    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      void this.signOut();
    }, INACTIVITY_TIMEOUT_MS);
  }

  protected toggleMobileMenu() {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  protected isLoginPage() {
    return this.router.url.startsWith('/login');
  }

  protected isDashboardPage() {
    return ['/admin', '/unit-admin', '/profile', '/trust', '/messages']
      .some((route) => this.router.url.startsWith(route));
  }

  protected async signOut() {
    this.closeMobileMenu();
    this.clearInactivityTimer();

    if (this.supabase.isAuthed()) {
      await this.supabase.signOut();
    }

    await this.router.navigate(['/']);
  }
}
