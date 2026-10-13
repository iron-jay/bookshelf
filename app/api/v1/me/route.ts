import { json, withUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withUser(async (_request, { user }) =>
  json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
  }),
);
