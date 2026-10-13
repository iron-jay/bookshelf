import { publicRoute, json } from "@/lib/api";
import { authDisabled } from "@/lib/auth";
import { SHELF_LABELS, SHELVES } from "@/lib/shelves";

export const dynamic = "force-dynamic";

/**
 * What the phone needs before it can do anything else: which app this is, what
 * its shelves are called, and whether it has to sign in at all. Public because
 * it is asked before there is a token, and it says nothing about anyone's shelf.
 */
export const GET = publicRoute(async () =>
  json({
    app: "bookshelf",
    apiVersion: 1,
    authRequired: !authDisabled(),
    shelves: SHELVES.map((key) => ({ key, label: SHELF_LABELS[key] })),
    features: ["reads", "series", "isbn"],
  }),
);
