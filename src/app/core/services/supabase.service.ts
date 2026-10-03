import { Injectable, computed, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { MyProfile } from '../models/models';

/**
 * Thin wrapper around the Supabase client. Every query made through `.client`
 * runs as the signed-in user, so Postgres RLS (see supabase/migrations) is what
 * actually enforces tenancy and field visibility — this service does not.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  private readonly _session = signal<Session | null>(null);
  private readonly _profile = signal<MyProfile | null>(null);
  private readonly initialization: Promise<void>;

  readonly session = this._session.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly isAuthed = computed(() => this._session() !== null);

  constructor() {
    this.client.auth.onAuthStateChange((_event, session) => { void this.setSession(session); });
    this.initialization = this.restoreSession();
  }

  private async restoreSession() {
    const { data } = await this.client.auth.getSession();
    await this.setSession(data.session);
  }

  async waitForInitialization() {
    await this.initialization;
  }

  private async setSession(session: Session | null) {
    this._session.set(session);
    if (!session) {
      this._profile.set(null);
      return;
    }
    // RLS: profiles_self_or_admin_read lets a user always read their own row.
    const { data } = await this.client.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    this._profile.set(data as MyProfile | null);
  }

  async refreshProfile() {
    const session = this._session();
    if (!session) return;
    await this.setSession(session);
  }

  signInWithPassword(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  sendPasswordReset(email: string, redirectTo: string) {
    return this.client.auth.resetPasswordForEmail(email, { redirectTo });
  }

  updatePassword(password: string) {
    return this.client.auth.updateUser({ password });
  }

  createAccountWithPassword(email: string, password: string, redirectTo: string, metadata: Record<string, unknown>) {
    return this.client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: metadata } });
  }

  signOut() {
    return this.client.auth.signOut();
  }

  /** Invoke a privileged Edge Function (see supabase/functions) — never call service-role logic from the client. */
  invoke<T = unknown>(fn: string, body: Record<string, unknown>) {
    return this.client.functions.invoke<T>(fn, { body });
  }
}
