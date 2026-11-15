/**
 * Which store the merchant pages work on, for users who manage more than
 * one (the master tenant runs the seed stores). Sent as X-Market-Store on
 * every /api/ call; the backend checks the user may manage that store.
 * Empty means "my own store". Kept in localStorage so it survives reloads.
 */
const KEY = 'tm.merchantStoreId';

export function selectedStoreId (): string {
  try {
    return typeof window === 'undefined' ? '' : window.localStorage.getItem( KEY ) || '';
  } catch {
    return '';
  }
}

export function setSelectedStoreId ( id: string ): void {
  try {
    if ( id ) window.localStorage.setItem( KEY, id );
    else window.localStorage.removeItem( KEY );
  } catch {
    // Private mode: the switch lasts until the page reloads.
  }
}
