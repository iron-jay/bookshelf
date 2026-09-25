import { getCurrentUser } from "@/lib/auth";
import { buildExport, toCsv } from "@/lib/export";

/**
 * No ceremony beyond being logged in. This is a self-hosted app and data
 * portability is table stakes, so the export is a plain GET you can curl.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ format: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const { format } = await params;
  if (format !== "json" && format !== "csv") {
    return new Response("Not found", { status: 404 });
  }

  const doc = await buildExport(user.id, user.username);
  const stamp = doc.exportedAt.slice(0, 10);
  const body = format === "json" ? JSON.stringify(doc, null, 2) : toCsv(doc);

  return new Response(body, {
    headers: {
      "Content-Type":
        format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookshelf-${stamp}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
