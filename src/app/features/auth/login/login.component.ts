import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

type Step = 'sign-in' | 'forgot' | 'sent';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly step = signal<Step>('sign-in');
  readonly email = signal('');
  readonly password = signal('');
  readonly sentTo = signal('');
  readonly returnTo = this.route.snapshot.queryParamMap.get('returnTo');
  readonly sentReset = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  async signIn() {
    this.error.set(null);
    this.busy.set(true);
    const { error } = await this.supabase.signInWithPassword(this.email().trim(), this.password());
    this.busy.set(false);
    if (error) { this.error.set(error.message); return; }
    await this.supabase.refreshProfile();
    if (!this.supabase.profile()) {
      if (this.returnTo?.startsWith('/invite/')) {
        await this.router.navigateByUrl(this.returnTo);
        return;
      }
      this.error.set('Your account is not connected to a community profile. Open your invitation link or contact your community administrator.');
      return;
    }
    await this.router.navigateByUrl(this.returnTo?.startsWith('/') ? this.returnTo : '/directory');
  }

  async requestPasswordReset() {
    this.error.set(null);
    this.sentReset.set(false);
    this.busy.set(true);
    const redirectTo = `${globalThis.location.origin}/auth/callback?flow=reset`;
    const { error } = await this.supabase.sendPasswordReset(this.email().trim(), redirectTo);
    this.busy.set(false);
    if (error) { this.error.set(error.message); return; }
    this.sentTo.set(this.email().trim());
    this.sentReset.set(true);
    this.step.set('sent');
  }

  showForgotPassword() { this.error.set(null); this.step.set('forgot'); }
  backToSignIn() { this.error.set(null); this.step.set('sign-in'); }

}