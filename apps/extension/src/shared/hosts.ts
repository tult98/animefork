import allowlist from '../../config/allowlist.json';

/** Match patterns for every allowlisted site, http and https. */
export const HOST_MATCHES = allowlist.hosts.flatMap((host) => [
  `http://${host}/*`,
  `https://${host}/*`,
]);
