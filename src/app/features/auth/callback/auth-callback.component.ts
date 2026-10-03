import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './auth-callback.component.html',
})
export class AuthCallbackComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  readonly error = signal<string | null>(null);
  readonly recovery = new URLSearchParams(globalThis.location.search).get('flow') === 'reset';
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly busy = signal(false);
  readonly saved = signal(false);

  constructor() {
    void this.completeSignIn();
  }

  private async completeSignIn() {
    await this.supabase.waitForInitialization();
    if (!this.supabase.isAuthed()) {
      this.error.set('This link is invalid or has expired. Request a new one and try again.');
      return;
    }
    await this.supabase.refreshProfile();
    const next = new URLSearchParams(globalThis.location.search).get('next');
    if (next?.startsWith('/invite/')) {
      await this.router.navigateByUrl(next);
      return;
    }
    if (this.recovery) return;
    if (!this.supabase.profile()) {
      this.error.set('Your account is signed in but is not connected to a community profile. Ask your community administrator for an invite.');
      return;
    }
    await this.router.navigate(['/directory']);
  }

  async savePassword() {
    this.error.set(null);
    if (this.newPassword().length < 8) {
      this.error.set('Choose a password with at least 8 characters.');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.error.set('The passwords do not match.');
      return;
    }
    this.busy.set(true);
    const { error } = await this.supabase.updatePassword(this.newPassword());
    this.busy.set(false);
    if (error) { this.error.set(error.message); return; }
    this.saved.set(true);
    const next = new URLSearchParams(globalThis.location.search).get('next');
    if (next?.startsWith('/invite/')) {
      await this.router.navigateByUrl(next);
      return;
    }
    await this.supabase.refreshProfile();
    await this.router.navigate(['/directory']);
  }
}