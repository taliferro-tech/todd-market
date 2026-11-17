import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';

import { MetaPixelService } from '../../services/meta-pixel.service';
import { SeoService } from '../../services/seo.service';
import { PublicFooterComponent } from '../../shared/public-footer/public-footer.component';
import { PublicHeaderComponent } from '../../shared/public-header/public-header.component';

/**
 * "Your privacy choices": turn off ad measurement (the Meta Pixel and the
 * server's purchase event) for this browser. Global Privacy Control does the
 * same automatically. Linked from every store's footer and the public footer.
 */
@Component( {
  selector: 'tm-privacy-choices',
  standalone: true,
  imports: [PublicHeaderComponent, PublicFooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tt-page' },
  template: `
    <tm-public-header />
    <main class="page">
      <h1>Your privacy choices</h1>
      <p class="lead">16Ahead Store uses the Meta Pixel and Meta's Conversions API to measure its own Facebook and Instagram ads: which pages you view, what you add to your bag, and whether you buy. Meta can use this to measure and target ads. You can turn it off for this browser.</p>

      <section class="card" aria-live="polite">
        @if (gpc) {
          <p class="state"><strong>Ad measurement is off.</strong></p>
          <p>Your browser sends Global Privacy Control, so we treat it as an opt-out. Nothing is sent to Meta from this browser.</p>
        } @else if (off()) {
          <p class="state"><strong>Ad measurement is off</strong> for this browser.</p>
          <button type="button" class="tm-btn" (click)="set(false)">Turn it back on</button>
        } @else {
          <p class="state"><strong>Ad measurement is on.</strong></p>
          <button type="button" class="tm-btn tm-btn--primary" (click)="set(true)">Turn off ad measurement</button>
        }
      </section>

      <p class="note">Your choice is saved in this browser. If you clear your browser data or use another device, choose again there. Opting out doesn't affect your orders, receipts or anything the stores need to ship to you. More in our <a href="https://16ahead.com/privacy#cookies-and-tracking-technologies">Privacy Policy</a>.</p>
    </main>
    <tm-public-footer />`,
  styles: [`
    .page { width: 100%; max-width: 720px; margin: 0 auto; padding: 48px 40px; display: flex; flex-direction: column; gap: 18px; flex: 1 0 auto; }
    h1 { font-size: 40px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; }
    .lead { font-size: 17px; color: var(--muted); }
    .card { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 22px; border-radius: 20px; background: var(--surface); }
    .state { font-size: 18px; }
    .note { font-size: 14px; color: var(--muted); }
    .note a { color: var(--text); font-weight: 600; }
    @media (max-width: 600px) { .page { padding: 28px 18px; } h1 { font-size: 30px; } }
  `],
} )
export class PrivacyChoicesComponent {
  private readonly pixel = inject( MetaPixelService );
  readonly gpc = this.pixel.gpc();
  readonly off = signal( isPlatformBrowser( inject( PLATFORM_ID ) ) && this.pixel.optedOut() );

  constructor () {
    inject( SeoService ).set( { title: 'Your privacy choices | 16Ahead Store', description: 'Turn off ad measurement for this browser.', path: '/help/privacy-choices', noindex: true } );
  }

  set ( off: boolean ): void {
    this.pixel.setOptOut( off );
    this.off.set( off );
  }
}
