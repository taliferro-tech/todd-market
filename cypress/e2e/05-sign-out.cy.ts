// Signing out ends the session: store pages stay open in browse mode (sample
// or empty data, saving off) instead of sending you to sign in.
describe( 'Sign out', () => {
  it( 'signs out from the menu, and the merchant app opens in browse mode', () => {
    cy.visit( '/app/dashboard' );
    cy.get( '.platform-menu-trigger' ).first().click();
    cy.contains( 'button', 'Sign out' ).click();
    cy.location( 'pathname' ).should( 'eq', '/' );
    cy.visit( '/app/orders' );
    cy.location( 'pathname' ).should( 'eq', '/app/orders' );
    cy.get( '[data-cy=browse-note]' ).should( 'contain', 'Browse mode' ).find( 'a' ).first()
      .should( 'have.attr', 'href' ).and( 'contain', 'as=merchant' );
    cy.visit( '/app/products/new' );
    cy.contains( 'button', 'Publish product' ).should( 'be.disabled' );
  } );

  it( 'signs out from the menu on the Shop stores home (/)', () => {
    cy.visit( '/' );
    cy.get( '.platform-menu-trigger' ).first().click();
    cy.contains( 'button', 'Sign out' ).click();
    cy.get( '.platform-menu-trigger' ).first().click();
    cy.contains( 'button', 'Sign out' ).should( 'not.exist' );
    cy.visit( '/account' );
    cy.location( 'pathname' ).should( 'eq', '/account' );
    cy.get( '[data-cy=browse-note]' ).should( 'contain', 'Browse mode' );
  } );
} );
