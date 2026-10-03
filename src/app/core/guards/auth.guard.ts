import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

/** Blocks unauthenticated access. This is a UX convenience only — RLS is the real gate. */
export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  await supabase.waitForInitialization();
  return supabase.isAuthed() ? true : router.createUrlTree(['/login']);
};
