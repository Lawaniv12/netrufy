import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SupabaseService } from './core/services/supabase.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly supabase = inject(SupabaseService);
  protected readonly mobileMenuOpen = signal(false);
  private readonly router = inject(Router);

  protected toggleMobileMenu() {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  protected isLoginPage() {
    return this.router.url.startsWith('/login');
  }

  async signOut() {
    this.closeMobileMenu();
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
