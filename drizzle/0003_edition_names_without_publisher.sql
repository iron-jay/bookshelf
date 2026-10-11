-- The publisher is no longer shown (2026-10-11), and Open Library editions
-- were named with it: "Paperback, Corgi Books 1990". Those names lose it —
-- "Paperback, 1990" — the way editionNameFor now builds them. The publisher
-- column itself is kept, and exported.
--
-- Only a name that ends in exactly what the old builder put there is changed,
-- matched by plain string comparison (a publisher can contain any regex
-- character). A name someone wrote themselves almost never ends that way, and
-- one that does reads the same afterwards minus the publisher.

-- "Paperback, Corgi Books 1990" → "Paperback, 1990"
UPDATE editions
SET name = left(name, length(name) - length(', ' || publisher || ' ' || substring(name FROM '(\d{4})$')))
           || ', ' || substring(name FROM '(\d{4})$')
WHERE ol_edition_key IS NOT NULL
  AND publisher IS NOT NULL AND publisher <> ''
  AND substring(name FROM '(\d{4})$') IS NOT NULL
  AND length(name) > length(', ' || publisher || ' 0000')
  AND right(name, length(', ' || publisher || ' 0000')) = ', ' || publisher || ' ' || substring(name FROM '(\d{4})$');
--> statement-breakpoint
-- "Paperback, Corgi Books" → "Paperback"
UPDATE editions
SET name = left(name, length(name) - length(', ' || publisher))
WHERE ol_edition_key IS NOT NULL
  AND publisher IS NOT NULL AND publisher <> ''
  AND length(name) > length(', ' || publisher)
  AND right(name, length(', ' || publisher)) = ', ' || publisher;
--> statement-breakpoint
-- "Corgi Books 1990" → "Book, 1990"; "Corgi Books" → "Book"
UPDATE editions
SET name = CASE WHEN format = 'audiobook' THEN 'Audiobook' ELSE 'Book' END
           || COALESCE(', ' || substring(name FROM ' (\d{4})$'), '')
WHERE ol_edition_key IS NOT NULL
  AND publisher IS NOT NULL AND publisher <> ''
  AND (name = publisher OR name = publisher || ' ' || substring(name FROM ' (\d{4})$'));
