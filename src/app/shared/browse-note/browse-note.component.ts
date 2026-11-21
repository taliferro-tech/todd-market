import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The browse-mode note on signed-out seller and account pages (the Network
 * standard): what the page is for, that it's showing sample or empty data
 * with saving off, and how to sign in or start a store.
 */
@Component( {
  selector: 'tm-browse-note',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="note tm-tint-blue" role="status" data-cy="browse-note">
      <strong>Browse mode.</strong> {{ note() }}
      <a routerLink="/sign-in" [queryParams]="signInParams()">Sign in</a>@if (merchant()) { or <a routerLink="/sell">start a store</a> } to {{ goal() }}.
    </p>`,
  styles: [`
    .note { margin: 0; padding: 14px 18px; border-radius: 16px; font-size: 15px; line-height: 1.5; }
    .note a { color: inherit; font-weight: 700; text-decoration: underline; }
  `],
} )
export class BrowseNoteComponent {
  readonly note = input.required<string>();
  /** Who signs in from here: a merchant (the seller app) or a shopper (the account). */
  readonly who = input<'merchant' | 'shopper'>( 'merchant' );
  /** Where to come back to after signing in. */
  readonly next = input( '/' );
  readonly merchant = computed( () => this.who() === 'merchant' );
  readonly goal = computed( () => this.merchant() ? 'manage your own store' : 'see your orders and saved items' );
  readonly signInParams = computed( () => ( { as: this.who(), next: this.next() } ) );
}
