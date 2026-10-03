import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

/** Route-level convenience for admin-only screens. Every admin write is still checked by RLS server-side. */
export const adminGuard: CanActivateFn = () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const role = supabase.profile()?.role;
  if (role === 'community_admin' || role === 'platform_admin') return true;
  router.navigate(['/directory']);
  return false;
};

export const unitManagerGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  await supabase.waitForInitialization();
  if (!supabase.isAuthed()) return router.createUrlTree(['/login']);
  const profile = supabase.profile();
  if (!profile) return router.createUrlTree(['/login']);
  if (profile.role === 'community_admin' || profile.role === 'platform_admin') return true;
  const { data } = await supabase.client.from('memberships').select('unit_id')
    .eq('profile_id', profile.id).eq('unit_role', 'leader').eq('status', 'verified');
  return data?.length ? true : router.createUrlTree(['/directory']);
};
