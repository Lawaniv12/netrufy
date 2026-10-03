import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { compressProfileImage } from '../../core/utils/image-compression';

interface ApplicationUnit {
  id: string;
  community_id: string;
  community_name: string;
  name: string;
}

@Component({
  selector: 'app-apply',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './apply.component.html',
})
export class ApplyComponent {
  private readonly supabase = inject(SupabaseService);
  readonly units = signal<ApplicationUnit[]>([]);
  readonly loading = signal(true);
  readonly unitId = signal('');
  readonly fullName = signal('');
  readonly email = signal('');
  readonly phone = signal('');
  readonly headline = signal('');
  readonly bio = signal('');
  readonly skills = signal('');
  readonly services = signal('');
  readonly publicListing = signal(false);
  readonly photo = signal<File | null>(null);
  readonly photoPreview = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  constructor() {
    void this.loadUnits();
  }

  async loadUnits() {
    const { data, error } = await this.supabase.client.from('public_application_units')
      .select('id, community_id, community_name, name').order('name');
    this.loading.set(false);
    if (error) { this.error.set('Could not load available Units. Please try again later.'); return; }
    this.units.set((data ?? []) as ApplicationUnit[]);
  }

  async selectPhoto(event: Event) {
    this.error.set(null);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.error.set('Choose a JPEG, PNG, or WebP photo.');
      input.value = '';
      return;
    }
    try {
      const compressed = await compressProfileImage(file);
      if (compressed.size > 102_400) {
        this.error.set('This photo could not be reduced below 100 KB. Choose a smaller image.');
        input.value = '';
        return;
      }
      const priorPreview = this.photoPreview();
      if (priorPreview) URL.revokeObjectURL(priorPreview);
      this.photo.set(compressed);
      this.photoPreview.set(URL.createObjectURL(compressed));
    } catch {
      this.error.set('Could not process that image. Please choose another photo.');
      input.value = '';
    }
  }

  async submit() {
    this.error.set(null);
    if (!this.unitId() || !this.fullName().trim() || !this.email().trim() || !this.phone().trim() || !this.photo()) {
      this.error.set('Complete your contact details, choose a Unit, and add a profile photo.');
      return;
    }
    this.busy.set(true);
    const applicationId = globalThis.crypto.randomUUID();
    const photoPath = `${applicationId}/photo`;
    const { error: uploadError } = await this.supabase.client.storage.from('applications').upload(photoPath, this.photo()!, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploadError) {
      this.busy.set(false);
      this.error.set('Photo upload failed. Please try again.');
      return;
    }
    const { error } = await this.supabase.invoke('submit-membership-application', {
      applicationId,
      unitId: this.unitId(),
      fullName: this.fullName().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
      headline: this.headline().trim(),
      bio: this.bio().trim(),
      skills: this.skills().split(',').map((item) => item.trim()).filter(Boolean),
      services: this.services().split(',').map((item) => item.trim()).filter(Boolean),
      wantsPublicListing: this.publicListing(),
    });
    this.busy.set(false);
    if (error) {
      await this.supabase.client.storage.from('applications').remove([photoPath]);
      this.error.set(error.message);
      return;
    }
    this.submitted.set(true);
  }
}