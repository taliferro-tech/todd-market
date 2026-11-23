// SYNCED FROM taliferro-ui/site-footer-component - edit it there, then run
// taliferro-ui/site-footer-component/sync.sh.
import { CommonModule } from '@angular/common';
import { Component, Input, ViewEncapsulation } from '@angular/core';

import { MENU_COMPANY, MENU_PRODUCTS, ProductKey } from '@taliferro/ui/platform/universal-menu.model';

/** One app in the footer: name and link from MENU_PRODUCTS, icon from the brand set. */
export interface FooterApp {
  key: ProductKey;
  label: string;
  url: string;
  icon: string;
}

export interface FooterGroup {
  id: string;
  title: string;
  description: string;
  apps: FooterApp[];
}

/** Brand icon file for each app (assets/brand/products/png/{light,dark}/<file>-64.png). */
const ICON_FILES: Partial<Record<ProductKey, string>> = {
  'ask-todd': '02-general-assistant', maya: '03-marketing-assistant', network: '04-network', outreach: '05-outreach',
  moves: '06-moves', docs: '07-docs', pulse: '08-pulse', social: '09-social', 'lead-vault': '10-lead-vault',
  find: '11-find', sayit: '12-sayit', 'email-creator': '13-email-creator', 'image-creator': '14-image-creator',
  'email-signature': '15-email-signature', market: '16-store',
};

/** The groups, in the apps page's order (design_handoff_16ahead_footer). */
const GROUPS: { id: string; title: string; description: string; keys: ProductKey[] }[] = [
  { id: 'intelligence', title: 'Intelligence', description: 'Ask, plan and decide', keys: ['ask-todd', 'maya', 'find', 'moves', 'pulse'] },
  { id: 'grow', title: 'Grow', description: 'Relationships, leads and outreach', keys: ['network', 'lead-vault', 'outreach', 'social', 'sayit', 'market'] },
  { id: 'create', title: 'Create', description: 'Documents, email and images', keys: ['docs', 'email-creator', 'email-signature', 'image-creator'] },
];

export const FOOTER_GROUPS: FooterGroup[] = GROUPS.map( ( group ) => ( {
  id: group.id,
  title: group.title,
  description: group.description,
  apps: group.keys
    .map( ( key ) => MENU_PRODUCTS.find( ( product ) => product.key === key ) )
    .filter( ( product ): product is NonNullable<typeof product> => !!product )
    .map( ( product ) => ( { key: product.key, label: product.label, url: product.url, icon: ICON_FILES[product.key] || '01-16ahead' } ) ),
} ) );

const CONSULT_BODY = 'Hi Taliferro Tech,\n\nOur business: \nWork we want off our plate: \nTools we use today: \n';

/**
 * The 16Ahead footer, the same in every web product except Find (Ty,
 * 2026-11-22; design_handoff_16ahead_footer). Desktop: the brand column and
 * four columns (Intelligence, Grow, Create, Company), then the legal bar.
 * Phones: the brand, Book a consultation, the four groups as accordions (one
 * open at a time), Email support / Call us, the address, legal pills.
 * Plain links, always in the page, so search engines can follow them.
 *
 * Anything between the tags (an app's own Help, About, Pricing links) goes in
 * the Company column. [build] shows a build string in the bottom bar.
 * Its styles are in this file (no package release needed to change them);
 * it uses the app's light/dark switch (html.dark / data-theme / the OS).
 */
@Component( {
  selector: 'app-site-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './site-footer.component.html',
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .sf { --sf-bg: #fff; --sf-surface: #f2f3f6; --sf-line: #e4e7ed; --sf-text: #0f1115; --sf-muted: #5a6170; --sf-faint: #9aa2b2;
      background: var(--sf-bg); color: var(--sf-text); border-top: 1px solid var(--sf-line); font-family: var(--font, "Helvetica Neue", Helvetica, Arial, sans-serif);
      padding: 56px 64px 0; box-sizing: border-box; width: 100%; margin-top: auto; }
    .sf *, .sf *::before, .sf *::after { box-sizing: border-box; }
    .sf a { color: inherit; text-decoration: none; }
    .sf a:focus-visible, .sf button:focus-visible { outline: 2px solid #2f6bff; outline-offset: 2px; border-radius: 8px; }
    .sf__ico--d { display: none; }
    @media (prefers-color-scheme: dark) {
      :root:not(.light):not([data-theme="light"]) .sf { --sf-bg: #0b0c10; --sf-surface: #16181e; --sf-line: #1f2229; --sf-text: #f2f4f8; --sf-muted: #a3aab8; --sf-faint: #6b7280; }
      :root:not(.light):not([data-theme="light"]) .sf__ico--l { display: none; }
      :root:not(.light):not([data-theme="light"]) .sf__ico--d { display: inline-block; }
    }
    html.dark .sf, :root[data-theme="dark"] .sf { --sf-bg: #0b0c10; --sf-surface: #16181e; --sf-line: #1f2229; --sf-text: #f2f4f8; --sf-muted: #a3aab8; --sf-faint: #6b7280; }
    html.dark .sf__ico--l, :root[data-theme="dark"] .sf__ico--l { display: none; }
    html.dark .sf__ico--d, :root[data-theme="dark"] .sf__ico--d { display: inline-block; }

    .sf__grid { display: grid; grid-template-columns: 300px repeat(4, minmax(0, 1fr)); gap: 40px; max-width: 1280px; margin: 0 auto; }
    .sf__brand-head { display: flex; align-items: center; gap: 12px; }
    .sf__brand-head img { width: 40px; height: 40px; }
    .sf__brand-name { font-size: 24px; font-weight: 700; letter-spacing: -.01em; }
    .sf__line { margin: 14px 0 0; color: var(--sf-muted); font-size: 15px; line-height: 1.5; }
    .sf__contacts { display: grid; gap: 14px; margin: 22px 0 0; padding: 0; list-style: none; }
    .sf__contact { display: flex; align-items: flex-start; gap: 12px; }
    .sf__tile { flex: 0 0 32px; width: 32px; height: 32px; border-radius: 10px; background: var(--sf-surface); display: grid; place-items: center; color: var(--sf-muted); }
    .sf__tile svg { width: 16px; height: 16px; }
    .sf__contact-text { display: grid; gap: 1px; font-size: 15px; line-height: 1.3; }
    .sf__contact-text small { color: var(--sf-muted); font-size: 12px; }
    .sf__consult { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 46px; margin-top: 24px; padding: 0 22px; border-radius: 999px;
      background: #0f1115; color: #fff !important; font-size: 15px; font-weight: 700; }
    html.dark .sf__consult, :root[data-theme="dark"] .sf__consult { background: #f2f4f8; color: #0f1115 !important; }
    @media (prefers-color-scheme: dark) { :root:not(.light):not([data-theme="light"]) .sf__consult { background: #f2f4f8; color: #0f1115 !important; } }
    .sf__consult svg { width: 16px; height: 16px; }

    .sf__head { display: block; width: 100%; padding: 0; border: 0; background: none; color: var(--sf-text); text-align: left; font: inherit; cursor: default; }
    .sf__title { display: block; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .sf__count, .sf__chev { display: none; }
    .sf__desc { margin: 6px 0 0; min-height: 36px; color: var(--sf-faint); font-size: 13px; line-height: 1.35; }
    .sf__list { display: grid; margin: 10px 0 0; padding: 0; list-style: none; }
    .sf__list a { display: flex; align-items: center; gap: 10px; padding: 7px 0; color: var(--sf-muted); font-size: 15px; }
    .sf__list a img { width: 22px; height: 22px; transition: transform .15s ease; }
    .sf__list a:hover, .sf__list a:focus-visible { color: var(--sf-text); font-weight: 700; }
    .sf__list a:hover img, .sf__list a:focus-visible img { transform: scale(1.08); }
    .sf__list a .sf__go { display: none; }
    .sf__company a { display: flex; padding: 7px 0; color: var(--sf-muted); font-size: 15px; }
    .sf__company a:hover, .sf__company a:focus-visible { color: var(--sf-text); font-weight: 700; }
    .sf__company-app { display: contents; }

    .sf__phone-contact { display: none; }
    .sf__bar { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; max-width: 1280px; margin: 48px auto 0; padding: 22px 0 26px; border-top: 1px solid var(--sf-line); color: var(--sf-muted); font-size: 13px; }
    .sf__legal { display: flex; gap: 24px; flex-wrap: wrap; }
    .sf__legal a:hover { color: var(--sf-text); }
    .sf__build { margin-left: auto; color: var(--sf-faint); font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }

    @media (max-width: 1279px) and (min-width: 1024px) {
      .sf__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .sf__brand { grid-column: 1 / -1; }
      .sf__contacts { grid-template-columns: repeat(3, auto); justify-content: start; gap: 14px 32px; }
    }
    @media (max-width: 1023px) and (min-width: 768px) {
      .sf { padding: 40px 32px 0; }
      .sf__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sf__brand { grid-column: 1 / -1; }
      .sf__contacts { grid-template-columns: repeat(3, auto); justify-content: start; gap: 14px 32px; }
    }
    @media (max-width: 767px) {
      .sf { padding: 30px 20px 0; }
      .sf__grid { display: block; }
      .sf__contacts { display: none; }
      .sf__consult { display: flex; width: 100%; height: 52px; margin: 22px 0 8px; }
      .sf__col { border-top: 1px solid var(--sf-line); }
      .sf__head { display: flex; align-items: center; gap: 10px; min-height: 60px; cursor: pointer; }
      .sf__title { font-size: 16px; letter-spacing: 0; text-transform: none; }
      .sf__count { display: inline-block; padding: 3px 10px; border-radius: 999px; background: var(--sf-surface); color: var(--sf-muted); font-size: 13px; font-weight: 600; }
      .sf__chev { display: grid; place-items: center; width: 32px; height: 32px; margin-left: auto; border-radius: 50%; background: var(--sf-surface); color: var(--sf-text); transition: transform .2s ease; }
      .sf__chev svg { width: 16px; height: 16px; }
      .sf__col.is-open .sf__chev { transform: rotate(180deg); }
      .sf__desc { display: none; }
      .sf__body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .2s ease; }
      .sf__col.is-open .sf__body { grid-template-rows: 1fr; }
      .sf__body > * { overflow: hidden; min-height: 0; }
      .sf__list { margin: 0; }
      .sf__col.is-open .sf__list, .sf__col.is-open .sf__company { padding-bottom: 8px; }
      .sf__list a, .sf__company a { min-height: 48px; padding: 0; font-size: 16px; color: var(--sf-text); align-items: center; }
      .sf__list a img { width: 28px; height: 28px; }
      .sf__list a .sf__go { display: inline; margin-left: auto; color: var(--sf-faint); font-size: 20px; }
      .sf__phone-contact { display: block; padding: 20px 0 0; border-top: 1px solid var(--sf-line); }
      .sf__phone-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .sf__phone-buttons a { display: flex; align-items: center; justify-content: center; gap: 8px; height: 50px; border-radius: 16px; background: var(--sf-surface); font-size: 16px; font-weight: 700; }
      .sf__phone-buttons svg { width: 16px; height: 16px; }
      .sf__address { display: flex; gap: 8px; margin-top: 14px; color: var(--sf-muted); font-size: 15px; line-height: 1.4; }
      .sf__address svg { flex: 0 0 14px; width: 14px; height: 14px; margin-top: 3px; }
      .sf__bar { display: grid; gap: 14px; margin-top: 20px; padding: 20px 0 28px; }
      .sf__legal { gap: 8px; }
      .sf__legal a { display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border-radius: 999px; background: var(--sf-surface); font-weight: 600; }
      .sf__legal { order: 1; }
      .sf__copy { order: 2; padding-top: 14px; border-top: 1px solid var(--sf-line); }
      .sf__build { order: 3; margin: 0; }
    }
    @media (prefers-reduced-motion: reduce) { .sf__body, .sf__chev, .sf__list a img { transition: none !important; } }
  `],
} )
export class SiteFooterComponent {
  /** A build string for the bottom bar (e.g. "v2026.11.22-build.1 · 999b4ab"); hidden when empty. */
  @Input() build = '';

  readonly company = MENU_COMPANY;
  readonly groups = FOOTER_GROUPS;
  readonly phoneHref = 'tel:+1' + MENU_COMPANY.phone.replace( /\D/g, '' );
  readonly mapsHref = 'https://maps.google.com/?q=' + encodeURIComponent( MENU_COMPANY.address );
  readonly consultHref = 'mailto:info@taliferro.tech?subject=Consultation&body=' + encodeURIComponent( CONSULT_BODY );
  readonly careers = MENU_COMPANY.links.find( ( link ) => /careers/i.test( link.label ) );
  readonly legal = MENU_COMPANY.links.filter( ( link ) => !/careers/i.test( link.label ) );
  readonly year = new Date().getFullYear();
  readonly street = MENU_COMPANY.address.split( /,\s*/ )[0] || MENU_COMPANY.address;
  readonly city = MENU_COMPANY.address.split( /,\s*/ ).slice( 1 ).join( ', ' );

  /** Phones: the one open group ('' = all closed). Ignored on wider screens, where every column shows. */
  open = '';

  toggle ( id: string ): void {
    this.open = this.open === id ? '' : id;
  }
}
