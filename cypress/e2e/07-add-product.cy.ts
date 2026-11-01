// A live store adds a product by hand (6b) with sizes and stock, sees it on
// Products (6a), and a shopper's product page shows "Only N left" and a
// sold-out size (6c).
describe( 'Products: add one by hand, with stock', () => {
  it( 'adds a product with two sizes, one sold out, and Products shows its stock', () => {
    cy.visit( '/app/products' );
    cy.contains( 'h1', 'Products' );
    cy.contains( '.row', 'Linen shirt' );
    cy.contains( 'a', 'Add product' ).click();
    cy.location( 'pathname' ).should( 'eq', '/app/products/new' );

    // Publishing without a photo is refused.
    cy.contains( 'label', 'Name' ).find( 'input' ).type( 'Test Cap-Toe Oxford' );
    cy.contains( 'label', 'Price' ).find( 'input' ).type( '189' );
    cy.contains( 'button', 'Publish product' ).click();
    cy.contains( '[role=alert]', 'Add at least one photo' );

    cy.get( '.photos input[type=file]' ).first().selectFile( 'cypress/fixtures/product-photo.png', { force: true } );
    cy.get( '.slot.filled' ).should( 'not.contain', 'Uploading' );

    cy.contains( 'button', '+ Add size' ).click();
    cy.get( '.add-input' ).type( '9, 10{enter}' );
    cy.contains( 'button', '+ Add color' ).click();
    cy.get( '.add-input' ).type( 'Black{enter}' );
    cy.contains( '.hint', '2 variants' );

    cy.get( '.stock-row' ).should( 'have.length', 2 );
    cy.contains( '.stock-row', 'Size 9' ).find( 'input' ).clear().type( '2' );
    cy.contains( '.stock-row', 'Size 10' ).find( 'input' ).clear().type( '0' );
    cy.contains( '.stock-row', 'Size 9' ).should( 'contain', 'Low' );
    cy.contains( '.stock-row', 'Size 10' ).should( 'contain', 'Sold out' );
    cy.contains( '.pcard .tm-tag', 'In stock · 1 size sold out' );

    cy.contains( 'button', 'Publish product' ).click();
    cy.location( 'pathname', { timeout: 15000 } ).should( 'eq', '/app/products' );
    cy.contains( '.row', 'Test Cap-Toe Oxford' ).within( () => {
      cy.contains( '2 units' );
      cy.contains( 'Black 10 out' );
      cy.contains( '.tm-tag', 'Some sizes out' );
    } );
    cy.contains( '.filters button', 'Some sizes out' ).click();
    cy.get( '.row:not(.th)' ).should( 'have.length', 1 );
  } );

  it( 'the shopper sees "Only 2 left" in size 9, size 10 sold out with a bell, and can buy size 9', () => {
    cy.visit( '/linen-loom?view=all&sort=new' );
    cy.contains( 'main.browse .prod', 'Test Cap-Toe Oxford', { timeout: 15000 } ).find( '.prod__open' ).click();
    cy.location( 'pathname' ).should( 'match', /^\/linen-loom\/products\// );
    cy.contains( 'h1', 'Test Cap-Toe Oxford' );
    cy.contains( '.tm-tag', 'Only 2 left in size 9' );
    cy.contains( '.pill', '10' ).should( 'have.class', 'out' ).click();
    cy.contains( '.soldout', 'Size 10 is sold out' );
    cy.contains( 'button', /^Add to bag/ ).should( 'not.exist' );

    cy.contains( '.pill', '9' ).click();
    cy.contains( 'button', 'Add to bag · $189' ).click();
    cy.contains( 'Added · add another' );
  } );

  it( 'opening the size from a link preselects it', () => {
    cy.visit( '/linen-loom?view=all&sort=new' );
    cy.contains( 'main.browse .prod', 'Test Cap-Toe Oxford', { timeout: 15000 } ).find( '.prod__open' ).click();
    cy.location( 'pathname' ).then( ( path ) => {
      cy.visit( `${ path }?size=10` );
      cy.contains( '.soldout', 'Size 10 is sold out' );
    } );
  } );
} );
