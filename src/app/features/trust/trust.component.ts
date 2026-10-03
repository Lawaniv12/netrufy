import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';
import {
  Attestation,
  CommunityGroup,
  HomeCellMembership,
  HomeCellMembershipRequest,
  MemberReference,
  ReferenceCandidate,
  Testimonial,
} from '../../core/models/models';

@Component({
  selector: 'app-trust',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trust.component.html',
})
export class TrustComponent implements OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private channel: ReturnType<typeof this.supabase.client.channel> | null = null;

  readonly attestations = signal<Attestation[]>([]);
  readonly testimonials = signal<Testimonial[]>([]);
  readonly homeCells = signal<CommunityGroup[]>([]);
  readonly homeCellMemberships = signal<HomeCellMembership[]>([]);
  readonly homeCellRequests = signal<HomeCellMembershipRequest[]>([]);
  readonly memberReferences = signal<MemberReference[]>([]);
  readonly referenceCandidates = signal<ReferenceCandidate[]>([]);
  readonly referenceCandidatesLoading = signal(true);
  readonly referenceCandidatesError = signal<string | null>(null);
  readonly selectedHomeCellId = signal('');
  readonly selectedReferenceMemberId = signal('');
  readonly responseReferenceId = signal<string | null>(null);
  readonly referenceRelationship = signal('');
  readonly referenceYearsKnown = signal<number | null>(null);
  readonly referenceStatement = signal('');
  readonly loading = signal(true);
  readonly sendingReference = signal(false);
  readonly referenceStatus = signal<string | null>(null);
  readonly referenceError = signal<string | null>(null);
  readonly newReferenceNotice = signal(false);
  readonly membershipMessage = signal<string | null>(null);
  readonly membershipError = signal<string | null>(null);

  constructor() {
    void this.load();
    const profileId = this.supabase.profile()?.id;
    if (profileId) {
      this.channel = this.supabase.client.channel(`member-reference-notices-${profileId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'member_references', filter: `recipient_id=eq.${profileId}`,
        }, () => {
          this.newReferenceNotice.set(true);
          void this.load();
        })
        .subscribe();
    }
  }

  ngOnDestroy() {
    if (this.channel) void this.supabase.client.removeChannel(this.channel);
  }

  async load() {
    this.loading.set(true);
    this.referenceCandidatesLoading.set(true);
    this.referenceCandidatesError.set(null);
    const profileId = this.supabase.profile()?.id;
    const [{ data: attestations }, { data: testimonials }, { data: groups }, { data: memberships }, { data: homeRequests }, { data: references }, candidateResult] = await Promise.all([
      this.supabase.client.from('attestations').select('*').order('created_at', { ascending: false }),
      this.supabase.client.from('testimonials').select('*').order('created_at', { ascending: false }),
      this.supabase.client.from('units').select('id, name, kind').eq('kind', 'home_cell').order('name'),
      this.supabase.client.from('memberships').select('unit_id, status').eq('profile_id', profileId ?? ''),
      this.supabase.client.from('home_cell_membership_requests').select('*'),
      this.supabase.client.from('my_member_references').select('*').order('created_at', { ascending: false }),
      this.supabase.client.from('community_reference_candidates').select('*').order('full_name'),
    ]);
    const { data: candidates, error: candidatesError } = candidateResult;
    this.attestations.set((attestations ?? []) as Attestation[]);
    this.testimonials.set((testimonials ?? []) as Testimonial[]);
    const homeCells = (groups ?? []) as CommunityGroup[];
    const statusByUnit = new Map((memberships ?? []).map((membership) => [membership.unit_id, membership.status]));
    this.homeCells.set(homeCells);
    this.homeCellMemberships.set(homeCells.flatMap((group) => {
      const status = statusByUnit.get(group.id);
      return status ? [{ unit_id: group.id, status, name: group.name } as HomeCellMembership] : [];
    }));
    this.homeCellRequests.set((homeRequests ?? []) as HomeCellMembershipRequest[]);
    this.memberReferences.set((references ?? []) as MemberReference[]);
    this.referenceCandidates.set((candidates ?? []) as ReferenceCandidate[]);
    this.referenceCandidatesError.set(candidatesError?.message ?? null);
    this.referenceCandidatesLoading.set(false);
    this.loading.set(false);
  }

  get incomingReferences() {
    const profileId = this.supabase.profile()?.id;
    return this.memberReferences().filter((reference) => reference.recipient_id === profileId);
  }

  get outgoingReferences() {
    const profileId = this.supabase.profile()?.id;
    return this.memberReferences().filter((reference) => reference.requester_id === profileId);
  }

  canRequestHomeCell(id: string) {
    const status = this.homeCellMemberships().find((membership) => membership.unit_id === id)?.status;
    return !status || status === 'rejected';
  }

  async requestHomeCellMembership() {
    const profile = this.supabase.profile();
    const homeCellId = this.selectedHomeCellId();
    if (!profile || !homeCellId || !this.canRequestHomeCell(homeCellId)) return;
    this.membershipError.set(null);
    this.membershipMessage.set(null);
    const existing = this.homeCellMemberships().find((membership) => membership.unit_id === homeCellId);
    const result = existing
      ? await this.supabase.client.from('memberships').update({ status: 'pending' })
          .eq('profile_id', profile.id).eq('unit_id', homeCellId).eq('status', 'rejected')
      : await this.supabase.client.from('memberships').insert({
          profile_id: profile.id, unit_id: homeCellId, community_id: profile.community_id,
          unit_role: 'member', status: 'pending',
        });
    if (result.error) { this.membershipError.set(result.error.message); return; }
    this.membershipMessage.set('Homecell membership request sent.');
    await this.load();
  }

  async reviewHomeCellRequest(request: HomeCellMembershipRequest, approve: boolean) {
    const { error } = await this.supabase.client.from('memberships')
      .update({ status: approve ? 'verified' : 'rejected' })
      .eq('profile_id', request.profile_id).eq('unit_id', request.unit_id).eq('status', 'pending');
    if (error) { this.membershipError.set(error.message); return; }
    await this.load();
  }

  async requestMemberReference() {
    this.referenceError.set(null);
    this.referenceStatus.set(null);
    if (!this.selectedReferenceMemberId()) {
      this.referenceError.set('Choose a member to request a reference from.');
      return;
    }
    this.sendingReference.set(true);
    const { data, error } = await this.supabase.invoke<{ emailSent: boolean }>('manage-member-reference', {
      action: 'request', recipientId: this.selectedReferenceMemberId(),
    });
    this.sendingReference.set(false);
    if (error) { this.referenceError.set(error.message); return; }
    this.referenceStatus.set(data?.emailSent
      ? 'Request sent. The member was also notified by email.'
      : 'Request sent. The member will see it in Trust when they next sign in.');
    this.selectedReferenceMemberId.set('');
    await this.load();
  }

  beginReferenceResponse(reference: MemberReference) {
    this.responseReferenceId.set(reference.id);
    this.referenceError.set(null);
  }

  async respondToReference(reference: MemberReference, decision: 'accept' | 'decline') {
    this.referenceError.set(null);
    const { error } = await this.supabase.invoke('manage-member-reference', {
      action: 'respond', referenceId: reference.id, decision,
      relationship: this.referenceRelationship().trim(),
      yearsKnown: this.referenceYearsKnown(),
      statement: this.referenceStatement().trim(),
    });
    if (error) { this.referenceError.set(error.message); return; }
    this.referenceStatus.set(decision === 'accept' ? 'Reference shared with the member.' : 'Request declined.');
    this.responseReferenceId.set(null);
    this.referenceRelationship.set('');
    this.referenceYearsKnown.set(null);
    this.referenceStatement.set('');
    await this.load();
  }

  dismissReferenceNotice() {
    this.newReferenceNotice.set(false);
  }

  async approveTestimonial(id: string, approve: boolean) {
    await this.supabase.client.from('testimonials').update({ status: approve ? 'approved' : 'rejected' }).eq('id', id);
    await this.load();
  }
}
