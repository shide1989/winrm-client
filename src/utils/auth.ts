import { AuthMethod, ParsedUsername } from '../types';

/**
 * Parse a username to detect its format and extract domain/user components.
 *
 * Supported formats:
 * - Local: "Administrator" -> { user: "Administrator", domain: "", format: "local" }
 * - Domain: "DOMAIN\user" -> { user: "user", domain: "DOMAIN", format: "domain" }
 * - UPN: "user@domain.com" -> { user: "user", domain: "domain.com", format: "upn" }
 */
export function parseUsername(username: string): ParsedUsername {
  if (username.includes('\\')) {
    const [domain, user] = username.split('\\', 2);
    return { user, domain, format: 'domain' };
  }

  if (username.includes('@')) {
    const [user, domain] = username.split('@', 2);
    return { user, domain, format: 'upn' };
  }

  return { user: username, domain: '', format: 'local' };
}

/**
 * Detect the appropriate authentication method based on username format.
 */
export function detectAuthMethod(username: string): AuthMethod {
  const parsed = parseUsername(username);
  return parsed.format === 'local' ? 'basic' : 'ntlm';
}

/**
 * Create a Basic authentication header string.
 */
export function createBasicAuth(username: string, password: string): string {
  return (
    'Basic ' + Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  );
}
