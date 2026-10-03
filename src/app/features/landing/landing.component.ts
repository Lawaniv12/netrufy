import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './landing.component.html',
})
export class LandingComponent {
  private readonly router = inject(Router);
  readonly query = signal('');

  search() {
    const query = this.query().trim();
    this.router.navigate(['/directory'], { queryParams: query ? { q: query } : {} });
  }
}