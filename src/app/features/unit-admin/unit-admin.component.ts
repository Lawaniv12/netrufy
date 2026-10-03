import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';

interface UnitApplication {
  id: string;
  unit_id: string;
  unit_name: string;
  full_name: string;
  email: string;
  phone: string;
  headline: string | null;
  bio: string | null;
  skills: string[];
  services: string[];
  photo_path: string;
  created_at: string;
  photo_url?: string;
}

interface UnitMember {
  profile_id: string;
  unit_id: string;
  unit_name: string;
  full_name: string;
  phone: string;
  headline: string | null;
  since: string | null;
}

type UnitAdminTab = 'applications' | 'members';

@Component({
  selector: 'app-unit-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './unit-admin.component.html',
})
export class UnitAdminComponent implements OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private channel: ReturnType<typeof this.supabase.client.channel> | null = null;
  readonly applications = signal<UnitApplication[]>([]);
  readonly members = signal<UnitMember[]>([]);
  readonly activeTab = signal<UnitAdminTab>('applications');
  readonly search = signal('');
  readonly loading = signal(true);
  readonly processingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly inviteUrl = signal<string | null>(null);

  get filteredApplications() {
    const query = this.search().trim().toLowerCase();
    if (!query) return this.applications();
    return this.applications().filter((application) =>
      [application.full_name, application.email, application.headline, application.unit_name]
        .filter(Boolean).join(' ').toLowerCase().includes(query));
  }

  get filteredMembers() {
    const query = this.search().trim().toLowerCase();
    if (!query) return this.members();
    return this.members().filter((member) =>
      [member.full_name, member.phone, member.headline, member.unit_name]
        .filter(Boolean).join(' ').toLowerCase().includes(query));
  }

  constructor() {
    void this.load();
    this.channel = this.supabase.client.channel('unit-application-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'membership_applications' }, () => {
        this.status.set('A new membership application arrived.');
        void this.load();
      })
      .subscribe();
  }

  ngOnDestroy() {
    if (this.channel) void this.supabase.client.removeChannel(this.channel);
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [{ data: applications, error: applicationError }, { data: members, error: memberError }] = await Promise.all([
      this.supabase.client.from('unit_application_queue').select('*').order('created_at', { ascending: true }),
      this.supabase.client.from('unit_member_roster').select('*').order('full_name'),
    ]);
    if (applicationError || memberError) {
      this.error.set('Could not load Unit administration data. Check that migration 0005 has been applied.');
      this.loading.set(false);
      return;
    }
    const rows = (applications ?? []) as UnitApplication[];
    const withPhotos = await Promise.all(rows.map(async (application) => {
      const { data } = await this.supabase.client.storage.from('applications').createSignedUrl(application.photo_path, 300);
      return { ...application, photo_url: data?.signedUrl };
    }));
    this.applications.set(withPhotos);
    this.members.set((members ?? []) as UnitMember[]);
    this.loading.set(false);
  }

  async review(application: UnitApplication, decision: 'approve' | 'reject') {
    this.error.set(null);
    this.status.set(null);
    this.inviteUrl.set(null);
    this.processingId.set(application.id);
    const { data, error } = await this.supabase.invoke<{ ok: boolean; inviteUrl?: string }>('review-membership-application', {
      applicationId: application.id,
      decision,
    });
    this.processingId.set(null);
    if (error) { this.error.set(error.message); return; }
    if (decision === 'approve' && data?.inviteUrl) {
      this.inviteUrl.set(data.inviteUrl);
      this.status.set('Approved. A signup invitation is ready for this applicant.');
    } else {
      this.status.set('Application rejected.');
    }
    await this.load();
  }

  async deactivateMember(member: UnitMember) {
    this.error.set(null);
    const { error } = await this.supabase.client.from('memberships')
      .update({ status: 'rejected' })
      .eq('profile_id', member.profile_id)
      .eq('unit_id', member.unit_id)
      .eq('status', 'verified');
    if (error) { this.error.set(error.message); return; }
    this.status.set(`${member.full_name} is no longer listed in ${member.unit_name}.`);
    await this.load();
  }

  async copyInvite() {
    if (!this.inviteUrl()) return;
    try {
      await navigator.clipboard.writeText(this.inviteUrl()!);
      this.status.set('Signup invitation copied.');
    } catch {
      this.error.set('Could not copy automatically. Select and copy the invitation link.');
    }
  }
}