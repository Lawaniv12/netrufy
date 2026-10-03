import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';
import { MyProfile, ProfileLink, Visibility } from '../../core/models/models';
import { compressProfileImage } from '../../core/utils/image-compression';

const FIELDS: Array<{ key: string; label: string }> = [
  { key: 'listed', label: 'Show my profile to signed-in community members' },
  { key: 'photo', label: 'Profile photo' },
  { key: 'headline', label: 'Headline' },
  { key: 'bio', label: 'Bio' },
  { key: 'skills', label: 'Skills' },
  { key: 'services', label: 'Services offered' },
  { key: 'location', label: 'Location' },
  { key: 'units', label: 'Units / groups' },
  { key: 'links', label: 'Portfolio links' },
  { key: 'cv', label: 'CV / résumé' },
  { key: 'trust', label: 'Guarantors & testimonials' },
  { key: 'contact', label: 'Contact (phone)' },
];

type ProfileTab = 'details' | 'privacy' | 'links';

/**
 * Self-service profile editor. Server-enforced limits this UI respects:
 * role/community_id/phone are not editable (no such inputs are rendered),
 * and `visibility` levels are 'private' | 'community' | 'viewers' only.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile.component.html',
})
export class ProfileComponent {
  private readonly supabase = inject(SupabaseService);

  readonly fields = FIELDS;
  readonly activeTab = signal<ProfileTab>('details');
  readonly profile = signal<MyProfile | null>(this.supabase.profile());
  readonly saving = signal(false);
  readonly savedAt = signal<Date | null>(null);
  readonly error = signal<string | null>(null);
  readonly skillsText = signal('');
  readonly servicesText = signal('');
  readonly links = signal<ProfileLink[]>([]);
  readonly linkKind = signal<ProfileLink['kind']>('portfolio');
  readonly linkUrl = signal('');
  readonly linksBusy = signal(false);
  readonly linksError = signal<string | null>(null);
  readonly photoBusy = signal(false);
  readonly photoError = signal<string | null>(null);

  constructor() {
    const p = this.supabase.profile();
    if (p) {
      this.skillsText.set((p.skills ?? []).join(', '));
      this.servicesText.set((p.services ?? []).join(', '));
      void this.loadLinks(p.id);
    }
  }

  async loadLinks(profileId: string) {
    const { data } = await this.supabase.client.from('profile_links')
      .select('id, kind, url').eq('profile_id', profileId).order('created_at');
    this.links.set((data ?? []) as ProfileLink[]);
  }

  async addLink() {
    const p = this.profile();
    const url = this.linkUrl().trim();
    if (!p) return;
    let parsed: URL;
    try { parsed = new URL(url); } catch { this.linksError.set('Enter a complete link starting with https://'); return; }
    if (!['http:', 'https:'].includes(parsed.protocol) || url.length > 500) {
      this.linksError.set('Use a valid http or https link (maximum 500 characters).');
      return;
    }
    this.linksBusy.set(true);
    this.linksError.set(null);
    const { error } = await this.supabase.client.from('profile_links').insert({
      profile_id: p.id,
      community_id: p.community_id,
      kind: this.linkKind(),
      url,
    });
    this.linksBusy.set(false);
    if (error) { this.linksError.set(error.message); return; }
    this.linkUrl.set('');
    await this.loadLinks(p.id);
  }

  async removeLink(linkId: string) {
    const p = this.profile();
    if (!p) return;
    const { error } = await this.supabase.client.from('profile_links').delete().eq('id', linkId);
    if (error) { this.linksError.set(error.message); return; }
    await this.loadLinks(p.id);
  }

  linkLabel(kind: ProfileLink['kind']) {
    return ({ portfolio: 'Portfolio', linkedin: 'LinkedIn', github: 'GitHub', website: 'Website', other: 'Other' })[kind];
  }

  async uploadProfilePhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const p = this.profile();
    if (!file || !p) return;
    this.photoError.set(null);
    if (!p.public_listing || this.visibilityFor('photo') !== 'public') {
      this.photoError.set('Enable public listing and set Photo visibility to Anyone before uploading. Profile photos are publicly accessible.');
      input.value = '';
      return;
    }

    this.photoBusy.set(true);
    try {
      const compressed = await compressProfileImage(file);
      const path = `${p.id}/profile.jpg`;
      const { error: uploadError } = await this.supabase.client.storage.from('member-photos').upload(path, compressed, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);
      const photoUrl = this.supabase.client.storage.from('member-photos').getPublicUrl(path).data.publicUrl;
      const { error } = await this.supabase.client.from('profiles').update({ photo_url: photoUrl }).eq('id', p.id);
      if (error) throw new Error(error.message);
      this.profile.set({ ...p, photo_url: photoUrl });
      await this.supabase.refreshProfile();
    } catch (error) {
      this.photoError.set(error instanceof Error ? error.message : 'Could not upload this profile photo.');
    } finally {
      this.photoBusy.set(false);
      input.value = '';
    }
  }

  visibilityFor(key: string): Visibility {
    return this.profile()?.visibility?.[key] ?? 'community';
  }

  setVisibility(key: string, level: Visibility) {
    const p = this.profile();
    if (!p) return;
    this.profile.set({ ...p, visibility: { ...p.visibility, [key]: level } });
  }

  async save() {
    const p = this.profile();
    if (!p) return;
    this.saving.set(true);
    this.error.set(null);

    const skills = this.skillsText().split(',').map((s) => s.trim()).filter(Boolean);
    const services = this.servicesText().split(',').map((s) => s.trim()).filter(Boolean);

    // Column grant on `profiles` only allows these fields from the client (see 0002_rls.sql) —
    // id, role, community_id and phone are rejected by Postgres even if included here.
    const { error } = await this.supabase.client
      .from('profiles')
      .update({
        full_name: p.full_name,
        headline: p.headline,
        bio: p.bio,
        skills,
        services,
        location: p.location,
        open_to_work: p.open_to_work,
        public_listing: p.public_listing,
        visibility: p.visibility,
      })
      .eq('id', p.id);

    this.saving.set(false);
    if (error) { this.error.set(error.message); return; }
    this.savedAt.set(new Date());
    await this.supabase.refreshProfile();
  }
}
