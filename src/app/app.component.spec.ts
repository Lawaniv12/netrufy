import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { SupabaseService } from './core/services/supabase.service';

describe('AppComponent', () => {
  let supabase: jasmine.SpyObj<SupabaseService>;

  beforeEach(async () => {
    supabase = jasmine.createSpyObj<SupabaseService>('SupabaseService', ['isAuthed', 'profile', 'signOut']);
    supabase.isAuthed.and.returnValue(true);
    supabase.profile.and.returnValue(null);
    supabase.signOut.and.resolveTo({ error: null } as any);

    await TestBed.configureTestingModule({
      imports: [AppComponent, RouterTestingModule],
      providers: [{ provide: SupabaseService, useValue: supabase }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should sign out after the inactivity timeout', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const router = TestBed.inject(Router);

    spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(app as any, 'signOut').and.callThrough();

    tick(20 * 60 * 1000);
    flushMicrotasks();

    expect((app as any).signOut).toHaveBeenCalled();
    expect(supabase.signOut).toHaveBeenCalled();
  }));
});
