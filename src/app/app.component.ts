import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly activityEvents = ['click', 'keydown', 'pointerdown', 'pointermove', 'scroll', 'touchstart', 'touchmove'] as const;

  constructor() {
    for (const eventName of this.activityEvents) {
      window.addEventListener(eventName, this.onUserActivity, { passive: true });
    }

    this.resetInactivityTimer();

    this.destroyRef.onDestroy(() => {
      for (const eventName of this.activityEvents) {
        window.removeEventListener(eventName, this.onUserActivity);
      }
      this.clearInactivityTimer();
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

  protected async signOut() {
    this.closeMobileMenu();
    this.clearInactivityTimer();

    if (this.supabase.isAuthed()) {
      await this.supabase.signOut();
    }

    await this.router.navigate(['/']);
  }
}
