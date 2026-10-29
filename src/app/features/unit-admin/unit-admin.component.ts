import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { DashboardShellComponent, DashboardNavItem } from '../../shared/dashboard-shell/dashboard-shell.component';
import { StatCardComponent, StatCardTone } from '../../shared/stat-card/stat-card.component';
import { ActivityFeedComponent, ActivityItem } from '../../shared/activity-feed/activity-feed.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

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
  joined_at: string | null;
  unit_role: 'member' | 'leader';
}

interface ApprovedApplication {
  id: string;
  full_name: string;
  email: string;
  reviewed_at: string | null;
}

type UnitAdminTab = 'applications' | 'members';

@Component({
  selector: 'app-unit-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, DashboardShellComponent, StatCardComponent, ActivityFeedComponent, EmptyStateComponent],
  templateUrl: './unit-admin.component.html',
})
export class UnitAdminComponent implements OnDestroy {
  readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fragmentSubscription: Subscription;
  private channel: ReturnType<typeof this.supabase.client.channel> | null = null;
  readonly applications = signal<UnitApplication[]>([]);
  readonly approvedApplications = signal<ApprovedApplication[]>([]);
  readonly members = signal<UnitMember[]>([]);
  readonly activeTab = signal<UnitAdminTab>('applications');
  readonly search = signal('');
  readonly loading = signal(true);
  readonly processingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly inviteUrl = signal<string | null>(null);
  readonly summaryStats = signal<Array<{ label: string; value: string; description: string; delta: string; icon: string; tone: StatCardTone }>>([]);
  readonly recentActivity = signal<ActivityItem[]>([]);
  readonly navItems: DashboardNavItem[] = [
    { label: 'Overview', route: '/unit-admin', fragment: 'overview' },
    { label: 'Applications', route: '/unit-admin', fragment: 'applications', badge: 'Live' },
    { label: 'Roster', route: '/unit-admin', fragment: 'roster' },
    { label: 'Trust', route: '/trust' },
  ];

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
    this.fragmentSubscription = this.route.fragment.subscribe((fragment) => {
      if (fragment === 'applications') this.activeTab.set('applications');
      if (fragment === 'roster') {
        this.activeTab.set('members');
        this.search.set('');
      }
    });
    void this.load();
    this.channel = this.supabase.client.channel('unit-application-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'membership_applications' }, () => {
        this.status.set('A new membership application arrived.');
        void this.load();
      })
      .subscribe();
  }

  ngOnDestroy() {
    this.fragmentSubscription.unsubscribe();
    if (this.channel) void this.supabase.client.removeChannel(this.channel);
  }

  setActiveTab(tab: UnitAdminTab) {
    this.activeTab.set(tab);
    this.search.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      fragment: tab === 'applications' ? 'applications' : 'roster',
    });
  }

  getUserInitials(name: string | null | undefined): string {
    const safeName = (name ?? 'Unit admin').trim();
    if (!safeName) return 'U';
    return safeName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [{ data: applications, error: applicationError }, { data: members, error: memberError }, { data: activityApplications }, { data: approvedApplications }] = await Promise.all([
      this.supabase.client.from('unit_application_queue').select('*').order('created_at', { ascending: true }),
      this.supabase.client.from('unit_member_roster').select('*').order('full_name'),
      this.supabase.client.from('membership_applications').select('id, full_name, status, created_at, reviewed_at').order('created_at', { ascending: false }).limit(20),
      this.supabase.client.from('membership_applications').select('id, full_name, email, reviewed_at').eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(20),
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
    this.approvedApplications.set((approvedApplications ?? []) as ApprovedApplication[]);
    const resolvedMembers = (members ?? []) as UnitMember[];
    this.members.set(resolvedMembers);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const joinedThisMonth = resolvedMembers.filter((member) => member.joined_at && Date.parse(member.joined_at) >= monthStart.getTime()).length;
    this.summaryStats.set([
      { label: 'Pending', value: String(withPhotos.length), description: 'Applications awaiting review', delta: '', icon: 'P', tone: 'green' },
      { label: 'Members', value: String(resolvedMembers.length), description: 'Verified roster count', delta: '', icon: 'M', tone: 'blue' },
      { label: 'Leaders', value: String(resolvedMembers.filter((member) => member.unit_role === 'leader').length), description: 'Active leaders', delta: '', icon: 'L', tone: 'amber' },
      { label: 'Joined this month', value: String(joinedThisMonth), description: 'New roster additions', delta: '', icon: 'N', tone: 'slate' },
    ]);
    const activity: ActivityItem[] = [
      ...((activityApplications ?? []) as Array<{ id: string; full_name: string; status: 'pending' | 'approved' | 'rejected'; created_at: string; reviewed_at: string | null }>).map((application) => ({
        id: `application-${application.id}`,
        title: application.status === 'pending' ? 'Application received' : `Application ${application.status}`,
        detail: application.status === 'pending'
          ? `${application.full_name} submitted an application for review.`
          : `${application.full_name}'s application was ${application.status}.`,
        at: application.status === 'pending' ? application.created_at : application.reviewed_at ?? application.created_at,
        tone: 'green' as const,
      })),
      ...((members ?? []) as UnitMember[]).filter((member) => member.joined_at).map((member) => ({
        id: `member-${member.profile_id}-${member.unit_id}`,
        title: 'Member joined',
        detail: `${member.full_name} joined ${member.unit_name}.`,
        at: member.joined_at!,
        tone: 'blue' as const,
      })),
    ];
    this.recentActivity.set(activity.sort((first, second) => Date.parse(second.at) - Date.parse(first.at)).slice(0, 5));
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

  async reissueInvitation(application: ApprovedApplication) {
    this.error.set(null);
    this.status.set(null);
    this.inviteUrl.set(null);
    this.processingId.set(application.id);
    const { data, error } = await this.supabase.invoke<{ ok: boolean; inviteUrl?: string }>('review-membership-application', {
      applicationId: application.id,
      action: 'reissue',
    });
    this.processingId.set(null);
    if (error) {
      const context = (error as Error & { context?: unknown }).context;
      if (context instanceof Response) {
        const body = await context.clone().json().catch(() => null) as { error?: unknown } | null;
        this.error.set(typeof body?.error === 'string' ? body.error : error.message);
      } else {
        this.error.set(error.message);
      }
      return;
    }
    if (!data?.inviteUrl) { this.error.set('Could not create a new invitation link.'); return; }
    this.inviteUrl.set(data.inviteUrl);
    this.status.set(`A fresh invitation link is ready for ${application.full_name}. The previous link has been replaced.`);
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