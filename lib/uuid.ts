const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a string can be a `uuid` column's value.
 *
 * Route ids arrive from the URL, so anything at all can land in one. Postgres
 * answers a malformed uuid with `invalid input syntax`, which reaches the
 * browser as a 500 — a typo in an address being reported as the server having
 * broken. Checking first turns those back into the 404 they are.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
