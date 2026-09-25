import { count } from "drizzle-orm";
import { redirect } from "next/navigation";

import { authDisabled, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Checked before the redirect below, not after. With sign-in off and nobody
  // to be, the app layout sends you here and a redirect would send you straight
  // back — gameshelf loops like that on an empty database.
  const [row] = await db.select({ n: count() }).from(users);

  if (row.n > 0 && (authDisabled() || (await getCurrentUser()))) {
    redirect("/");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-xs border border-line bg-panel p-6">
        <h1 className="mb-6 text-xl font-medium">bookshelf</h1>

        {row.n === 0 ? (
          // A self-hosted app with nobody in it would otherwise answer every
          // correct password with "incorrect" and give no hint why.
          <div className="flex flex-col gap-3 font-narrow text-ink-dim">
            <p>No user has been created yet.</p>
            <p>
              The container creates one from <span className="font-mono">ADMIN_USERNAME</span> and{" "}
              <span className="font-mono">ADMIN_PASSWORD</span> when it starts. In development, run{" "}
              <span className="font-mono">npm run db:seed</span>.
            </p>
          </div>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}
