/**
 * Rows per import request. At one Open Library request a second and two or so
 * per new book, five rows is ten to fifteen seconds — long enough to be worth
 * the round trip, short enough that no proxy times it out and progress moves.
 * In a plain module because a "use server" file may only export async
 * functions.
 */
export const IMPORT_CHUNK = 5;

/**
 * Books per "Find missing covers" request. Up to four queued requests each
 * (Open Library edition and work, Google by ISBN and by title) — five books
 * stays well inside any proxy timeout.
 */
export const COVER_CHUNK = 5;
