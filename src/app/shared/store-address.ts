import { environment } from '../../environments/environment';

/**
 * A store's public address: its own domain when connected and active,
 * otherwise 16ahead.store/<slug> (reserved paths like /help and
 * /sell can never be a slug; see RESERVED_SLUGS in the backend).
 */
export function storeAddress ( slug: string, customDomain?: { name: string; status: string } | null ): string {
  if ( customDomain?.status === 'active' ) return customDomain.name;
  return `${ environment.PLATFORM_URL.replace( /^https?:\/\//, '' ) }/${ slug }`;
}
