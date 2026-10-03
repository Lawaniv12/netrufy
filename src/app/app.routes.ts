import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard, unitManagerGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: 'invite/:token',
    loadComponent: () =>
      import('./features/auth/redeem-invite/redeem-invite.component').then((m) => m.RedeemInviteComponent),
  },
  {
    path: 'apply',
    loadComponent: () => import('./features/apply/apply.component').then((m) => m.ApplyComponent),
  },
  {
    // Public, account-free guarantor page. Deliberately outside the authGuard.
    path: 'g/:token',
    loadComponent: () => import('./features/guarantor/guarantor.component').then((m) => m.GuarantorComponent),
  },
  {
    path: 'directory',
    loadComponent: () => import('./features/directory/directory.component').then((m) => m.DirectoryComponent),
  },
  {
    path: 'unit-admin',
    canActivate: [unitManagerGuard],
    loadComponent: () => import('./features/unit-admin/unit-admin.component').then((m) => m.UnitAdminComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'trust',
    canActivate: [authGuard],
    loadComponent: () => import('./features/trust/trust.component').then((m) => m.TrustComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
  },
  { path: '**', redirectTo: 'directory' },
];
