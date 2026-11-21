import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { ONBOARDING_STEPS, OnboardingStep } from '../../models/merchant.model';
import { merchantBrowseNote } from '../../services/browse-mode';
import { MarketAuthService } from '../../services/market-auth.service';
import { MerchantService } from '../../services/merchant.service';
import { BrowseNoteComponent } from '../../shared/browse-note/browse-note.component';
import { PlatformMenuComponent } from '../../shared/platform-menu/platform-menu.component';

/**
 * The merchant app's frame: "TODD Market for merchants", the onboarding step
 * bar while onboarding (§1: done cyan, current blue, later grey), and the
 * store's own pages (dashboard, orders, settings) once it's live.
 */
@Component( {
  selector: 'tm-merchant-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, PlatformMenuComponent, BrowseNoteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tt-page' },
  template: `
    <div class="page">
      <header class="head">
        <a class="title" routerLink="/app">16Ahead Store <span>for merchants</span></a>
        @if (switcher(); as sw) {
          <label class="switch">
            <span class="sr-only">Store</span>
            <select (change)="onSwitch($event)" aria-label="Choose a store to manage">
              @for (s of sw.options; track s.id) { <option [value]="s.id" [selected]="s.id === sw.currentId">{{ s.label }}</option> }
            </select>
            @if (sw.currentSeed) { <span class="seed">Seed store</span> }
          </label>
        }
        @if (onboardingStep(); as current) {
          <ol class="steps" aria-label="Setup steps">
            @for (s of steps; track s.key; let i = $index) {
              <li [class.done]="i < stepIndex()" [class.current]="i === stepIndex()" [attr.aria-current]="i === stepIndex() ? 'step' : null">
                <span class="dot"></span>{{ s.label }}
              </li>
            }
          </ol>
        } @else if (merchant.store()) {
          <nav class="nav" aria-label="Your store">
            <a routerLink="/app/products" [class.on]="section() === 'products'">Products</a>
            <a routerLink="/app/orders" [class.on]="section() === 'orders'">Orders</a>
            <a routerLink="/app/dashboard" [class.on]="section() === 'dashboard'">Referrals</a>
            <a routerLink="/app/settings" [class.on]="section() === 'settings'">Settings</a>
            <a [routerLink]="['/', merchant.store()!.slug]">View store</a>
          </nav>
        }
        <app-platform-menu [shopper]="auth.isShopper()" shopperProfileRoute="/account" [hiddenRoutes]="auth.menuHiddenRoutes()" [isLoggedIn]="auth.isSignedIn()" [userName]="auth.user()?.displayName || ''"
          [userEmail]="auth.user()?.email || ''" (signOut)="signOut()" />
      </header>
      @if (browseNote()) { <tm-browse-note [note]="browseNote()" who="merchant" [next]="path()" /> }
      <router-outlet />
    </div>`,
  styles: [`
    .page { width: 100%; max-width: 1240px; margin: 0 auto; padding: 30px 40px 44px; display: flex; flex-direction: column; gap: 28px; flex: 1 0 auto; }
    .head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .title { font-weight: 700; letter-spacing: -0.02em; font-size: 18px; margin-right: auto; color: var(--text); }
    .title span { color: var(--muted); }
    .steps { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; list-style: none; margin: 0; padding: 0; }
    .steps li { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; white-space: nowrap; color: var(--muted); }
    .steps li.done, .steps li.current { color: var(--text); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface2); }
    .done .dot { background: var(--cyan); }
    .current .dot { background: var(--blue); }
    .switch { display: flex; align-items: center; gap: 8px; }
    .switch select { font: inherit; font-size: 14px; font-weight: 600; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line, var(--surface2)); background: var(--surface); color: var(--text); max-width: 240px; }
    .seed { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--surface2); color: var(--muted); white-space: nowrap; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .nav { display: flex; gap: 4px; flex-wrap: wrap; }
    .nav a { padding: 8px 14px; border-radius: 999px; font-size: 14px; font-weight: 600; color: var(--text); }
    .nav a:hover, .nav a.on { background: var(--surface); color: var(--text); }
    @media (max-width: 600px) { .page { padding: 22px 18px 32px; } }
  `],
} )
export class MerchantShellComponent {
  readonly auth = inject( MarketAuthService );
  readonly merchant = inject( MerchantService );
  private readonly router = inject( Router );
  readonly steps = ONBOARDING_STEPS;
  private readonly url = signal( this.router.url );

  readonly onboardingStep = computed<OnboardingStep | null>( () => {
    const match = this.url().match( /^\/app\/onboarding\/([a-z-]+)/ );
    return match ? match[1] as OnboardingStep : null;
  } );
  readonly stepIndex = computed( () => this.steps.findIndex( ( s ) => s.key === this.onboardingStep() ) );
  readonly path = computed( () => this.url().split( /[?#]/ )[0] );
  readonly section = computed( () => this.path().split( '/' )[2] || '' );
  /** Signed out: what this page is for, and that it's a sample with saving off. */
  readonly browseNote = computed( () => this.merchant.browsing() ? merchantBrowseNote( this.url() ) : '' );
  /** The store switcher, for users who manage more than one store (seed stores). */
  readonly switcher = computed( () => {
    const stores = this.merchant.stores();
    if ( stores.length < 2 ) return null;
    const current = this.merchant.store();
    return {
      currentId: current?.id ?? '',
      currentSeed: !!current?.seed,
      options: stores.map( ( s ) => ( { id: s.id, label: s.status === 'live' ? s.name : `${ s.name } (${ s.status })` } ) ),
    };
  } );

  constructor () {
    // The header's store links need the store, whichever page opened first.
    void this.merchant.current().catch( () => null );
    this.router.events.pipe( filter( ( e ): e is NavigationEnd => e instanceof NavigationEnd ) )
      .subscribe( ( e ) => this.url.set( e.urlAfterRedirects ) );
  }

  onSwitch ( event: Event ): void {
    const id = ( event.target as HTMLSelectElement ).value;
    if ( id && id !== this.merchant.store()?.id ) this.merchant.switchStore( id );
  }

  async signOut (): Promise<void> {
    this.merchant.resetStores();
    await this.auth.signOut();
    this.merchant.store.set( undefined );
    await this.router.navigateByUrl( '/' );
  }
}
