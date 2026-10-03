import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

type Stage = 'loading' | 'invalid' | 'need-code' | 'code-sent' | 'done';

/**
 * Public, account-free page at /g/:token. Uses its own anonymous Supabase client
 * (no session) and talks only to the guarantor-* Edge Functions, which validate
 * the token/OTP server-side with the service role. No table is queried directly
 * from here — the functions return only what this page needs to render.
 */
@Component({
  selector: 'app-guarantor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './guarantor.component.html',
})
export class GuarantorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly anon = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { persistSession: false },
  });

  readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  readonly stage = signal<Stage>('loading');
  readonly memberName = signal('');
  readonly guarantorName = signal('');
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly code = signal('');
  readonly relationship = signal('');
  readonly yearsKnown = signal<number | null>(null);
  readonly statement = signal('');

  constructor() {
    this.checkToken();
  }

  private async checkToken() {
    const { data, error } = await this.anon.functions.invoke<{ memberName: string; guarantorName: string }>(
      'guarantor-status',
      { body: { token: this.token } },
    );
    if (error || !data) { this.stage.set('invalid'); return; }
    this.memberName.set(data.memberName);
    this.guarantorName.set(data.guarantorName);
    this.stage.set('need-code');
  }

  async sendCode() {
    this.error.set(null);
    this.busy.set(true);
    const { error } = await this.anon.functions.invoke('guarantor-send-otp', { body: { token: this.token } });
    this.busy.set(false);
    if (error) { this.error.set(this.friendly(error)); return; }
    this.stage.set('code-sent');
  }

  async submit() {
    this.error.set(null);
    if (!/^\d{6}$/.test(this.code())) { this.error.set('Enter the 6-digit code.'); return; }
    if (this.statement().trim().length < 20) { this.error.set('Statement must be at least 20 characters.'); return; }
    this.busy.set(true);
    const { error } = await this.anon.functions.invoke('guarantor-submit', {
      body: {
        token: this.token,
        code: this.code(),
        relationship: this.relationship().trim(),
        yearsKnown: this.yearsKnown(),
        statement: this.statement().trim(),
      },
    });
    this.busy.set(false);
    if (error) { this.error.set(this.friendly(error)); return; }
    this.stage.set('done');
  }

  private friendly(_e: unknown) {
    return 'That didn\u2019t work — the code may be wrong, expired, or already used.';
  }
}
