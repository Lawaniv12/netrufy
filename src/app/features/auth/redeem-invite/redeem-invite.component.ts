import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

/**
 * Invitees create an email/password account, then bind their community profile
 * to the invite through the server-side redemption function.
 */
@Component({
  selector: 'app-redeem-invite',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './redeem-invite.component.html',
})
export class RedeemInviteComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  readonly fullName = signal('');
  readonly phone = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly awaitingConfirmation = signal(false);
  readonly inviteValid = signal<boolean | null>(null);
  readonly communityName = signal<string | null>(null);
  readonly groupName = signal<string | null>(null);
  readonly approvedEmail = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  constructor() {
    const metadata = this.supabase.session()?.user.user_metadata;
    if (typeof metadata?.['full_name'] === 'string') this.fullName.set(metadata['full_name']);
    if (typeof metadata?.['phone'] === 'string') this.phone.set(metadata['phone']);
    void this.validateInvite();
  }

  async validateInvite() {
    const { data, error } = await this.supabase.invoke<{
      valid: boolean;
      communityName?: string | null;
      groupName?: string | null;
      inviteeEmail?: string | null;
      inviteeName?: string | null;
      inviteePhone?: string | null;
    }>('validate-invite', { token: this.token });
    if (error || !data?.valid) {
      this.inviteValid.set(false);
      return;
    }
    this.communityName.set(data.communityName ?? null);
    this.groupName.set(data.groupName ?? null);
    this.approvedEmail.set(data.inviteeEmail ?? null);
    if (data.inviteeEmail) this.email.set(data.inviteeEmail);
    if (data.inviteeName) this.fullName.set(data.inviteeName);
    if (data.inviteePhone) this.phone.set(data.inviteePhone);
    this.inviteValid.set(true);
  }

  get isAuthed() {
    return this.supabase.isAuthed();
  }

  async createAccount() {
    this.error.set(null);
    if (this.fullName().trim().length < 2) { this.error.set('Enter your full name.'); return; }
    if (this.phone().replace(/\D/g, '').length < 10) { this.error.set('Enter a valid phone number.'); return; }
    if (this.password().length < 8) { this.error.set('Choose a password with at least 8 characters.'); return; }
    if (this.password() !== this.confirmPassword()) { this.error.set('The passwords do not match.'); return; }
    this.busy.set(true);
    const next = `/invite/${this.token}`;
    const redirectTo = `${globalThis.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    if (this.approvedEmail() && this.email().trim().toLowerCase() !== this.approvedEmail()!.toLowerCase()) {
      this.error.set('Use the email address approved by your Unit administrator.');
      return;
    }
    const { data, error } = await this.supabase.createAccountWithPassword(this.email().trim(), this.password(), redirectTo, {
      full_name: this.fullName().trim(),
      phone: this.phone().trim(),
    });
    this.busy.set(false);
    if (error) { this.error.set(error.message); return; }
    if (!data.user?.identities?.length) {
      this.error.set('An account already exists for this email. Sign in to continue with your invite.');
      return;
    }
    if (data.session) {
      await this.supabase.refreshProfile();
      return;
    }
    this.awaitingConfirmation.set(true);
  }

  async redeem() {
    this.error.set(null);
    if (!this.fullName().trim()) { this.error.set('Please enter your full name.'); return; }
    if (this.phone().replace(/\D/g, '').length < 10) { this.error.set('Please enter a valid phone number.'); return; }
    this.busy.set(true);
    const { error } = await this.supabase.invoke('redeem-invite', {
      token: this.token,
      fullName: this.fullName().trim(),
      phone: this.phone().trim(),
    });
    this.busy.set(false);
    if (error) { this.error.set(error.message); return; }
    await this.supabase.refreshProfile();
    this.router.navigate(['/profile']);
  }
}
