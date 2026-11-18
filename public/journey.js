/*
 * Visitor journey breadcrumbs (16Ahead, 2026-11-17). The same file is in
 * every public site's public/ folder; the backend is
 * todd-backend/functions/journey.service.js, and the master admin sees each
 * visit as one line on the health page (App Activity -> Journeys).
 *
 * Records, per browser session: the page landed on (and each page after
 * it), the buttons and links pressed (their words, never what was typed),
 * a form started or sent, and explicit steps a page reports with
 * window.journey('step', 'Question 3 of 8') or
 * window.journey('checkout', 'Coffee mug'). Where the visit came from is
 * read once: utm_source/medium/campaign, a Facebook or Google ad click id,
 * else the referring site, else direct.
 *
 * Nothing runs on localhost or under browser automation (tests). Presses
 * inside an element marked data-journey-off (a survey's answer buttons, whose
 * words are the answer) aren't recorded.
 */
( function () {
  'use strict';
  if ( typeof window === 'undefined' || window.journey ) return;
  var noop = function () {};
  var host = String( location.hostname || '' ).toLowerCase();
  if ( !host || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test( host ) || navigator.webdriver ) {
    window.journey = noop;
    return;
  }
  var API = 'https://api.taliferro.tech/api/journey';

  function id () {
    return Math.random().toString( 36 ).slice( 2, 10 ) + Date.now().toString( 36 );
  }
  function read ( store, key ) {
    try { return window[store].getItem( key ); } catch ( e ) { return null; }
  }
  function write ( store, key, value ) {
    try { window[store].setItem( key, value ); } catch ( e ) { /* private mode */ }
  }

  var visitorId = read( 'localStorage', 'jr_v' ) || id();
  write( 'localStorage', 'jr_v', visitorId );

  var session = null;
  try { session = JSON.parse( read( 'sessionStorage', 'jr_s' ) || 'null' ); } catch ( e ) { session = null; }
  if ( !session || !session.id ) {
    var q = new URLSearchParams( location.search );
    var source = q.get( 'utm_source' ) || '';
    var medium = q.get( 'utm_medium' ) || '';
    if ( !source && q.get( 'fbclid' ) ) { source = 'facebook'; medium = medium || 'paid'; }
    if ( !source && ( q.get( 'gclid' ) || q.get( 'gbraid' ) || q.get( 'wbraid' ) ) ) { source = 'google'; medium = medium || 'paid'; }
    var ref = '';
    try { ref = document.referrer ? new URL( document.referrer ).hostname.replace( /^www\./, '' ) : ''; } catch ( e ) { ref = ''; }
    if ( ref === host.replace( /^www\./, '' ) ) ref = '';
    session = {
      id: id(),
      source: source || ref || 'direct',
      medium: medium || ( ref && !source ? 'referral' : '' ),
      campaign: q.get( 'utm_campaign' ) || '',
      referrer: ref
    };
    write( 'sessionStorage', 'jr_s', JSON.stringify( session ) );
  }

  // Path without the query (it can carry emails or tokens), long ids folded.
  function cleanPath () {
    return String( location.pathname || '/' ).split( '/' ).map( function ( part ) {
      return part.length >= 20 || /^[0-9a-f-]{12,}$/i.test( part ) ? ':id' : part;
    } ).join( '/' ).slice( 0, 120 );
  }

  // Signed in? Then stop: journeys are for visitors, and inside the apps a
  // button's words can be a customer's contact. Signed-in use is already
  // logged elsewhere. Reads Firebase Auth's saved user (localStorage or its
  // IndexedDB) without ever creating that database.
  var signedIn = null;
  var checkedAt = 0;
  var waiting = [];
  function hasAuthKey ( keys ) {
    for ( var i = 0; i < keys.length; i++ ) if ( String( keys[i] ).indexOf( 'firebase:authUser:' ) === 0 ) return true;
    return false;
  }
  function checkSignedIn ( done ) {
    try {
      var local = [];
      for ( var i = 0; i < localStorage.length; i++ ) local.push( localStorage.key( i ) );
      if ( hasAuthKey( local ) ) return done( true );
    } catch ( e ) { /* blocked */ }
    if ( !window.indexedDB ) return done( false );
    var finished = false;
    var finish = function ( value ) { if ( !finished ) { finished = true; done( value ); } };
    setTimeout( function () { finish( false ); }, 1500 );
    try {
      var open = indexedDB.open( 'firebaseLocalStorageDb' );
      // Not there: abort so the database is never created (Firebase makes it).
      open.onupgradeneeded = function ( event ) { try { event.target.transaction.abort(); } catch ( e ) { /* ok */ } finish( false ); };
      open.onerror = function () { finish( false ); };
      open.onsuccess = function () {
        var db = open.result;
        try {
          if ( !db.objectStoreNames.contains( 'firebaseLocalStorage' ) ) { db.close(); return finish( false ); }
          var req = db.transaction( 'firebaseLocalStorage', 'readonly' ).objectStore( 'firebaseLocalStorage' ).getAllKeys();
          req.onsuccess = function () { db.close(); finish( hasAuthKey( req.result || [] ) ); };
          req.onerror = function () { db.close(); finish( false ); };
        } catch ( e ) { try { db.close(); } catch ( x ) { /* ok */ } finish( false ); }
      };
    } catch ( e ) { finish( false ); }
  }
  function whenAllowed ( fn ) {
    if ( signedIn === true ) return;
    if ( signedIn === false && Date.now() - checkedAt < 5000 ) return fn();
    waiting.push( fn );
    if ( waiting.length > 1 ) return;
    checkSignedIn( function ( now ) {
      var was = signedIn;
      signedIn = now;
      checkedAt = Date.now();
      var queue = waiting;
      waiting = [];
      if ( now ) {
        if ( was === false ) post( 'step', 'Signed in' );
        return;
      }
      queue.forEach( function ( f ) { f(); } );
    } );
  }

  function send ( kind, label ) {
    whenAllowed( function () { post( kind, label ); } );
  }

  function post ( kind, label ) {
    var body = JSON.stringify( {
      sessionId: session.id,
      visitorId: visitorId,
      site: host,
      kind: kind,
      label: String( label || '' ).replace( /\s+/g, ' ' ).trim().slice( 0, 80 ),
      path: cleanPath(),
      source: session.source,
      medium: session.medium,
      campaign: session.campaign,
      referrer: session.referrer,
      mobile: !!( window.matchMedia && window.matchMedia( '(max-width: 700px)' ).matches ),
      webdriver: !!navigator.webdriver
    } );
    try {
      if ( navigator.sendBeacon && navigator.sendBeacon( API, new Blob( [body], { type: 'text/plain' } ) ) ) return;
    } catch ( e ) { /* fall through */ }
    try {
      fetch( API, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } } ).catch( noop );
    } catch ( e ) { /* never break the page */ }
  }

  window.journey = function ( kind, label ) {
    if ( typeof kind === 'string' && kind ) send( kind, label );
  };

  // Landed: the first page, then each page a single-page app moves to.
  var lastPath = '';
  function landed () {
    var path = cleanPath();
    if ( path === lastPath ) return;
    lastPath = path;
    // Let the app set the new page's title first.
    setTimeout( function () { send( 'landed', document.title ); }, 400 );
  }
  [ 'pushState', 'replaceState' ].forEach( function ( name ) {
    var original = history[name];
    if ( typeof original !== 'function' ) return;
    history[name] = function () {
      var result = original.apply( this, arguments );
      landed();
      return result;
    };
  } );
  window.addEventListener( 'popstate', landed );
  if ( document.readyState === 'loading' ) document.addEventListener( 'DOMContentLoaded', landed );
  else landed();

  // Pressed: buttons and links, by their words (or data-journey / aria-label).
  document.addEventListener( 'click', function ( event ) {
    var el = event.target && event.target.closest ? event.target.closest( '[data-journey],a,button,[role="button"],input[type="submit"],input[type="button"]' ) : null;
    if ( !el || ( el.closest && el.closest( '[data-journey-off]' ) ) ) return;
    var label = el.getAttribute( 'data-journey' ) || el.getAttribute( 'aria-label' ) || el.value || el.innerText || el.getAttribute( 'title' ) || '';
    label = String( label ).replace( /\s+/g, ' ' ).trim();
    if ( !label && el.tagName === 'A' ) label = el.getAttribute( 'href' ) || '';
    if ( label ) send( 'clicked', label );
  }, true );

  // A form started (first field touched) and sent. Values are never read.
  function formName ( form ) {
    if ( !form ) return 'a form';
    var heading = form.querySelector( 'h1,h2,h3,legend' );
    return form.getAttribute( 'data-journey' ) || form.getAttribute( 'aria-label' ) || form.getAttribute( 'name' ) || form.id || ( heading && heading.innerText ) || 'a form';
  }
  var started = {};
  document.addEventListener( 'focusin', function ( event ) {
    var el = event.target;
    if ( !el || !/^(INPUT|TEXTAREA|SELECT)$/.test( el.tagName ) || /^(button|submit|checkbox|radio|hidden)$/.test( el.type || '' ) ) return;
    if ( el.closest && el.closest( '[data-journey-off]' ) ) return;
    var key = cleanPath() + '|' + formName( el.form );
    if ( started[key] ) return;
    started[key] = true;
    send( 'form_started', formName( el.form ) );
  }, true );
  document.addEventListener( 'submit', function ( event ) {
    send( 'form_sent', formName( event.target ) );
  }, true );
} )();
