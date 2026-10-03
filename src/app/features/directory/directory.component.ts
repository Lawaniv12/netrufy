import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { ProfileLink, PublicDirectoryProfile } from '../../core/models/models';

type ExploreView = 'people' | 'services' | 'skills';

/**
 * Lists `directory_profiles` — a masked view where visibility is already applied
 * by Postgres (see supabase/migrations/0002_rls.sql). No client-side filtering
 * of sensitive fields happens or should happen here.
 */
@Component({
  selector: 'app-directory',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './directory.component.html',
})
export class DirectoryComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  readonly demoMode = false;

  readonly people = signal<PublicDirectoryProfile[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly activeView = signal<ExploreView>('people');
  readonly selectedService = signal('');
  readonly selectedProfile = signal<PublicDirectoryProfile | null>(null);
  readonly selectedLinks = signal<ProfileLink[]>([]);
  readonly detailsLoading = signal(false);
  readonly contactPhone = signal<string | null>(null);
  readonly contactMessage = signal<string | null>(null);

  constructor() {
    this.search.set(this.route.snapshot.queryParamMap.get('q') ?? '');
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await this.supabase.client
      .from('public_directory_profiles')
      .select('*')
      .order('full_name');
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.people.set((data ?? []) as PublicDirectoryProfile[]);
  }

  get filtered() {
    const q = this.search().trim().toLowerCase();
    return this.people().filter((p) => {
      if (this.activeView() === 'services' && !p.services?.length) return false;
      if (this.activeView() === 'skills' && !p.skills?.length) return false;
      if (this.selectedService() && !(p.services ?? []).includes(this.selectedService())) return false;
      const haystack = [p.full_name, p.headline, p.bio, p.location, ...(p.services ?? []), ...(p.skills ?? [])]
        .filter(Boolean).join(' ').toLowerCase();
      return !q || haystack.includes(q);
    });
  }

  get serviceOffers() {
    const counts = new Map<string, number>();
    for (const person of this.people()) {
      for (const service of person.services ?? []) counts.set(service, (counts.get(service) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 8);
  }

  get sectionTitle() {
    if (this.activeView() === 'services') return 'Services people are offering';
    if (this.activeView() === 'skills') return 'People by skill';
    return 'People in your community';
  }

  explore(view: ExploreView) {
    this.activeView.set(view);
    this.selectedService.set('');
  }

  exploreService(service: string) {
    this.activeView.set('services');
    this.selectedService.set(service);
    this.search.set('');
  }

  async openProfile(profile: PublicDirectoryProfile) {
    this.selectedProfile.set(profile);
    this.selectedLinks.set([]);
    this.contactPhone.set(null);
    this.contactMessage.set(null);
    this.detailsLoading.set(true);
    const { data, error } = await this.supabase.client.from('public_profile_links')
      .select('id, profile_id, kind, url').eq('profile_id', profile.id);
    this.detailsLoading.set(false);
    if (error) {
      this.contactMessage.set('Some profile details could not be loaded.');
      return;
    }
    this.selectedLinks.set((data ?? []) as ProfileLink[]);
  }

  closeProfile() {
    this.selectedProfile.set(null);
    this.selectedLinks.set([]);
    this.contactMessage.set(null);
  }

  async revealProfileContact(profileId: string) {
    if (!this.isAuthed) return;
    this.contactMessage.set(null);
    const { data, error } = await this.supabase.client.rpc('reveal_contact', { p_profile: profileId });
    if (error || !data) {
      this.contactMessage.set('This member has not shared their phone number with the community.');
      return;
    }
    this.contactPhone.set(data as string);
  }

  get isAuthed() {
    return this.supabase.isAuthed();
  }
  profileLinkLabel(kind: ProfileLink['kind']) {
    return ({ portfolio: 'Portfolio', linkedin: 'LinkedIn', github: 'GitHub', website: 'Website', other: 'Other link' })[kind];
  }

  waLink(phone: string, name: string) {
    const message = encodeURIComponent(`Hi ${name}, I found your profile in our community and would like to connect.`);
    return `https://wa.me/${phone}?text=${message}`;
  }

  avatarTone(name: string) {
    const tones = [
      'bg-blue-100 text-blue-900',
      'bg-emerald-100 text-emerald-900',
      'bg-amber-100 text-amber-900',
      'bg-rose-100 text-rose-900',
      'bg-cyan-100 text-cyan-900',
    ];
    const index = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length;
    return tones[index];
  }

  initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

}
