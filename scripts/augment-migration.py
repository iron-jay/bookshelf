#!/usr/bin/env python3
"""Add to a generated migration the objects drizzle-kit cannot express.

Run after `npm run db:generate` when the generated migration is the one that
first creates the schema:

    python3 scripts/augment-migration.py drizzle/0000_init.sql

The view is lifted verbatim out of schema.sql rather than retyped, so the
cover-inheritance rule in section 4a lives in exactly one place.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BREAK = "--> statement-breakpoint"


def lift(src: str, pattern: str, label: str) -> str:
    m = re.search(pattern, src, re.S)
    if not m:
        raise SystemExit(f"could not lift {label} from schema.sql")
    return m.group(0).strip()


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    mig = ROOT / sys.argv[1]
    src = (ROOT / "schema.sql").read_text()
    sql = mig.read_text()

    if "CREATE EXTENSION" in sql:
        print(f"[skip] {mig.name} already augmented")
        return 0

    view = lift(src, r"CREATE VIEW entry_cards AS.*?;\n", "entry_cards view")
    func = lift(
        src, r"CREATE OR REPLACE FUNCTION touch_updated_at.*?LANGUAGE plpgsql;", "trigger fn"
    )
    trg_works = lift(src, r"CREATE TRIGGER works_touch.*?touch_updated_at\(\);", "works trigger")
    trg_entries = lift(
        src, r"CREATE TRIGGER entries_touch.*?touch_updated_at\(\);", "entries trigger"
    )

    # Extensions must land before anything else: uuid_generate_v4() is a column
    # default on nearly every table, and the works title index needs gin_trgm_ops.
    head = (
        "CREATE EXTENSION IF NOT EXISTS pg_trgm;\n" + BREAK + "\n"
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n' + BREAK + "\n"
    )
    body = [func, trg_works, trg_entries, view]
    tail = "\n" + BREAK + "\n" + ("\n" + BREAK + "\n").join(body) + "\n"

    mig.write_text(head + sql.rstrip("\n") + tail)
    print(f"[augmented] {mig.relative_to(ROOT)}")
    for label, obj in [
        ("extensions", "pg_trgm, uuid-ossp"),
        ("function", "touch_updated_at"),
        ("triggers", "works_touch, entries_touch"),
        ("view", "entry_cards"),
    ]:
        print(f"  {label:12} {obj}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
