import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';
import { CommunityGroup, DirectMessageReport } from '../../core/models/models';
import { DashboardShellComponent, DashboardNavItem } from '../../shared/dashboard-shell/dashboard-shell.component';
import { StatCardComponent, StatCardTone } from '../../shared/stat-card/stat-card.component';
import { ActivityFeedComponent, ActivityItem } from '../../shared/activity-feed/activity-feed.component';
import { ModerationQueueComponent, ModerationQueueItem } from '../../shared/moderation-queue/moderation-queue.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

type AdminTab = 'invites' | 'groups' | 'reports';

/**
 * Community group setup: Units represent departments; Home Cells are a separate
 * membership checkpoint with designated leaders.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, DashboardShellComponent, StatCardComponent, ActivityFeedComponent, ModerationQueueComponent, EmptyStateComponent],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  readonly supabase = inject(SupabaseService);
  readonly activeTab = signal<AdminTab>('invites');
  readonly groups = signal<CommunityGroup[]>([]);
  readonly communityName = signal('Community');
  readonly members = signal<{ id: string; full_name: string }[]>([]);
  readonly messageReports = signal<DirectMessageReport[]>([]);
  readonly dashboardStats = signal<Array<{ label: string; value: string; description: string; delta: string; icon: string; tone: StatCardTone }>>([]);
  readonly recentActivity = signal<ActivityItem[]>([]);
  readonly moderationItems = signal<ModerationQueueItem[]>([]);
  readonly navItems: DashboardNavItem[] = [
    { label: 'Overview', route: '/admin', fragment: 'overview' },
    { label: 'Membership', route: '/admin', fragment: 'membership', badge: 'Live' },
    { label: 'Groups', route: '/admin', fragment: 'groups' },
    { label: 'Moderation', route: '/admin', fragment: 'moderation' },
  ];
  readonly groupName = signal('');
  readonly groupKind = signal<'unit' | 'home_cell'>('unit');
  readonly leaderGroupId = signal('');
  readonly leaderProfileId = signal('');
  readonly unitLeaderGroupId = signal('');
  readonly unitLeaderProfileId = signal('');
  readonly inviteGroupId = signal('');
  readonly inviteUrl = signal('');
  readonly inviteExpiresAt = signal('');
  readonly creatingInvite = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal<string | null>(null);

  constructor() {
    this.load();
    void this.loadMessageReports();
  }

  getUserInitials(name: string | null | undefined): string {
    const safeName = (name ?? 'Admin').trim();
    if (!safeName) return 'A';
    return safeName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  }

  async load() {
    const communityId = this.supabase.profile()?.community_id;
    if (!communityId) return;
    const [{ data: groups }, { data: members }, { data: community }, { data: newMembers }, { data: applications }, { data: invites }] = await Promise.all([
      this.supabase.client.from('units').select('id, name, kind').order('name'),
      this.supabase.client.from('profiles').select('id, full_name').eq('role', 'member').order('full_name'),
      this.supabase.client.from('communities').select('name').eq('id', communityId).maybeSingle(),
      this.supabase.client.from('profiles').select('id, full_name, created_at').eq('community_id', communityId).eq('role', 'member').order('created_at', { ascending: false }).limit(10),
      this.supabase.client.from('membership_applications').select('id, full_name, status, created_at, reviewed_at').eq('community_id', communityId).order('created_at', { ascending: false }).limit(10),
      this.supabase.client.from('invites').select('id, invitee_name, created_at').eq('community_id', communityId).order('created_at', { ascending: false }).limit(10),
    ]);
    const resolvedGroups = (groups ?? []) as CommunityGroup[];
    const resolvedMembers = (members ?? []) as { id: string; full_name: string }[];
    this.groups.set(resolvedGroups);
    this.members.set(resolvedMembers);
    this.communityName.set(community?.name ?? 'Community');

    this.dashboardStats.set([
      { label: 'Members', value: String(resolvedMembers.length), description: 'Active members', delta: '', icon: 'M', tone: 'green' },
      { label: 'Units', value: String(resolvedGroups.filter((group) => group.kind === 'unit').length), description: 'Registered Units', delta: '', icon: 'U', tone: 'blue' },
      { label: 'Home cells', value: String(resolvedGroups.filter((group) => group.kind === 'home_cell').length), description: 'Registered Home Cells', delta: '', icon: 'H', tone: 'amber' },
      { label: 'Open reports', value: String(this.messageReports().filter((report) => report.status === 'open').length), description: 'Awaiting review', delta: '', icon: 'R', tone: 'slate' },
    ]);

    const activity: ActivityItem[] = [
      ...(newMembers ?? []).map((member) => ({
        id: `member-${member.id}`,
        title: 'Member joined',
        detail: `${member.full_name} joined the organization.`,
        at: member.created_at,
        tone: 'green' as const,
      })),
      ...(applications ?? []).map((application) => ({
        id: `application-${application.id}`,
        title: application.status === 'pending' ? 'Application received' : `Application ${application.status}`,
        detail: `${application.full_name} ${application.status === 'pending' ? 'submitted an application.' : `had an application ${application.status}.`}`,
        at: application.status === 'pending' ? application.created_at : application.reviewed_at ?? application.created_at,
        tone: 'amber' as const,
      })),
      ...(invites ?? []).map((invite) => ({
        id: `invite-${invite.id}`,
        title: 'Invitation issued',
        detail: invite.invitee_name ? `An invitation was sent to ${invite.invitee_name}.` : 'A member invitation was created.',
        at: invite.created_at,
        tone: 'blue' as const,
      })),
    ];
    this.recentActivity.set(activity.sort((first, second) => Date.parse(second.at) - Date.parse(first.at)).slice(0, 5));
  }

  async loadMessageReports() {
    const { data, error } = await this.supabase.client.rpc('community_direct_message_reports');
    if (error) { this.error.set(error.message); return; }
    const reports = (data ?? []) as DirectMessageReport[];
    this.messageReports.set(reports);
    this.dashboardStats.update((stats) => stats.map((stat) => {
      if (stat.label === 'Open reports') return { ...stat, value: String(reports.filter((report) => report.status === 'open').length) };
      return stat;
    }));
    this.moderationItems.set(reports.slice(0, 4).map((report) => ({
      id: report.id,
      title: report.reason,
      detail: `${report.reporter_name} reported ${report.reported_member_name}`,
      status: report.status,
      severity: report.status === 'open' ? 'high' : report.status === 'reviewed' ? 'medium' : 'low',
      updatedAt: new Date(report.created_at).toLocaleDateString(),
    })));
  }

  async updateMessageReport(report: DirectMessageReport, status: DirectMessageReport['status']) {
    this.error.set(null);
    const { error } = await this.supabase.client.from('direct_message_reports')
      .update({ status }).eq('id', report.id);
    if (error) { this.error.set(error.message); return; }
    await this.loadMessageReports();
  }

  async createGroup() {
    const name = this.groupName().trim();
    const communityId = this.supabase.profile()?.community_id;
    if (!name || !communityId) return;
    this.error.set(null);
    this.saved.set(null);
    const { error } = await this.supabase.client.from('units').insert({
      name,
      kind: this.groupKind(),
      community_id: communityId,
    });
    if (error) { this.error.set(error.message); return; }
    this.groupName.set('');
    this.saved.set('Group created.');
    await this.load();
  }

  async assignHomeCellLeader() {
    const communityId = this.supabase.profile()?.community_id;
    const profileId = this.leaderProfileId();
    const unitId = this.leaderGroupId();
    if (!communityId || !profileId || !unitId) return;
    this.error.set(null);
    this.saved.set(null);
    const { error } = await this.supabase.client.from('memberships').upsert({
      profile_id: profileId,
      unit_id: unitId,
      community_id: communityId,
      unit_role: 'leader',
      status: 'verified',
    }, { onConflict: 'profile_id,unit_id' });
    if (error) { this.error.set(error.message); return; }
    this.saved.set('Home Cell leader assigned.');
    await this.load();
  }

  async assignUnitLeader() {
    const communityId = this.supabase.profile()?.community_id;
    const profileId = this.unitLeaderProfileId();
    const unitId = this.unitLeaderGroupId();
    if (!communityId || !profileId || !unitId) return;
    this.error.set(null);
    this.saved.set(null);
    const { error } = await this.supabase.client.from('memberships').upsert({
      profile_id: profileId,
      unit_id: unitId,
      community_id: communityId,
      unit_role: 'leader',
      status: 'verified',
    }, { onConflict: 'profile_id,unit_id' });
    if (error) { this.error.set(error.message); return; }
    this.saved.set('Unit leader assigned.');
    await this.load();
  }

  async createInvite() {
    this.error.set(null);
    this.saved.set(null);
    this.creatingInvite.set(true);
    const { data, error } = await this.supabase.invoke<{ inviteUrl: string; expiresAt: string }>('create-invite', {
      unitId: this.inviteGroupId() || null,
      expiresInDays: 7,
    });
    this.creatingInvite.set(false);
    if (error || !data) { this.error.set(error?.message ?? 'Could not create an invitation.'); return; }
    this.inviteUrl.set(data.inviteUrl);
    this.inviteExpiresAt.set(data.expiresAt);
  }

  async copyInvite() {
    try {
      await navigator.clipboard.writeText(this.inviteUrl());
      this.saved.set('Invitation link copied.');
    } catch {
      this.error.set('Could not copy automatically. Select and copy the invitation link.');
    }
  }
}
