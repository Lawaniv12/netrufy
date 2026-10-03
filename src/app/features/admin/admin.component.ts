import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';
import { CommunityGroup } from '../../core/models/models';

type AdminTab = 'invites' | 'groups';

/**
 * Community group setup: Units represent departments; Home Cells are a separate
 * membership checkpoint with designated leaders.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  private readonly supabase = inject(SupabaseService);
  readonly activeTab = signal<AdminTab>('invites');
  readonly groups = signal<CommunityGroup[]>([]);
  readonly communityName = signal('Community');
  readonly members = signal<{ id: string; full_name: string }[]>([]);
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
  }

  async load() {
    const communityId = this.supabase.profile()?.community_id;
    if (!communityId) return;
    const [{ data: groups }, { data: members }, { data: community }] = await Promise.all([
      this.supabase.client.from('units').select('id, name, kind').order('name'),
      this.supabase.client.from('profiles').select('id, full_name').eq('role', 'member').order('full_name'),
      this.supabase.client.from('communities').select('name').eq('id', communityId).maybeSingle(),
    ]);
    this.groups.set((groups ?? []) as CommunityGroup[]);
    this.members.set(members ?? []);
    this.communityName.set(community?.name ?? 'Community');
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
