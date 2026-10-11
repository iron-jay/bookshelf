/**
 * The only place in the app that talks to Comic Vine (comicvine.gamespot.com),
 * the catalogue for comics and graphic novels (2026-10-11).
 *
 * Optional like Hardcover: with no COMICVINE_API_KEY nothing here makes a
 * request, and every failure — a rejected key, a block, no network — comes
 * back as "nothing found". A key is free with a Comic Vine account.
 *
 * Its terms: non-commercial use only, 200 requests per resource per hour,
 * with "velocity detection" against bursts, so requests are serialised a
 * second apart; and a link back to Comic Vine wherever its data is shown.
 *
 * Its model: a volume is a run (Saga, Image, 2012) and its issues are what
 * gets shelved — a single issue, a trade paperback, a graphic novel. Collected
 * editions are usually volumes of their own whose issues are "Volume One",
 * "Volume Two" and so on, so one issue is one book on the shelf either way.
 */
import { version } from "@/package.json";
import { reviewText } from "@/lib/import/goodreads";
import { createSerialiser } from "@/lib/rate-limit";

const API = "https://comicvine.gamespot.com/api";
const serialise = createSerialiser(1100);

/** Comic Vine's own image host. Nothing else is shown or downloaded as its art. */
const IMAGE_HOST = /^https:\/\/comicvine\.gamespot\.com\/a\/uploads\//;

function key(): string {
  return (process.env.COMICVINE_API_KEY ?? "").trim();
}

export function comicvineEnabled(): boolean {
  return key() !== "";
}

let warnedAboutKey = false;

type Envelope<T> = { status_code?: number; error?: string; results?: T; number_of_total_results?: number };

async function request<T>(path: string, params: Record<string, string>): Promise<Envelope<T> | null> {
  if (!comicvineEnabled()) return null;
  const url = new URL(`${API}/${path}/`);
  for (const [name, value] of Object.entries({ ...params, api_key: key(), format: "json" })) {
    url.searchParams.set(name, value);
  }
  return serialise(async () => {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          // Comic Vine turns away generic clients; this says who is asking.
          "User-Agent": `bookshelf/${version} (${process.env.OPENLIBRARY_CONTACT?.trim() || "+https://github.com/iron-jay/bookshelf"})`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        console.warn(`[comicvine] ${res.status}`);
        return null;
      }
      const body = (await res.json()) as Envelope<T>;
      if (body.status_code === 100) {
        if (!warnedAboutKey) console.warn("[comicvine] key rejected; set a valid COMICVINE_API_KEY");
        warnedAboutKey = true;
        return null;
      }
      // 101 is "object not found": an answer, just an empty one.
      if (body.status_code !== 1) {
        if (body.status_code !== 101) console.warn(`[comicvine] status ${body.status_code}: ${body.error}`);
        return null;
      }
      return body;
    } catch {
      console.warn("[comicvine] no response");
      return null;
    }
  });
}

type Image = {
  original_url?: string;
  super_url?: string;
  medium_url?: string;
  small_url?: string;
  thumb_url?: string;
} | null;

function image(img: Image | undefined, ...sizes: (keyof NonNullable<Image>)[]): string | null {
  for (const size of sizes) {
    const url = img?.[size];
    // Comic Vine's "no art" placeholder is a real image on its host.
    if (url && IMAGE_HOST.test(url) && !/-blank\.(png|jpe?g)$/i.test(url)) return url;
  }
  return null;
}

function year(date: string | null | undefined): number | null {
  const y = Number(date?.slice(0, 4));
  return Number.isInteger(y) && y > 1800 && y < 3000 ? y : null;
}

type VolumeDoc = {
  id?: number;
  name?: string;
  start_year?: string | null;
  publisher?: { name?: string } | null;
  count_of_issues?: number;
  image?: Image;
  deck?: string | null;
  site_detail_url?: string;
};

export type ComicVolume = {
  id: number;
  name: string;
  startYear: number | null;
  /** Shown to tell runs apart — Marvel's Star Wars (2015) from Dark Horse's. */
  publisher: string | null;
  issueCount: number;
  thumbUrl: string | null;
  deck: string | null;
  pageUrl: string | null;
};

function toVolume(doc: VolumeDoc): ComicVolume | null {
  if (!Number.isInteger(doc.id) || !doc.name?.trim()) return null;
  return {
    id: doc.id!,
    name: doc.name.trim(),
    startYear: year(doc.start_year),
    publisher: doc.publisher?.name?.trim() || null,
    issueCount: Number.isInteger(doc.count_of_issues) ? doc.count_of_issues! : 0,
    thumbUrl: image(doc.image, "small_url", "thumb_url", "medium_url"),
    deck: doc.deck?.trim() || null,
    pageUrl: doc.site_detail_url ?? null,
  };
}

const VOLUME_FIELDS = "id,name,start_year,publisher,count_of_issues,image,deck,site_detail_url";

/** Runs whose name matches. Comic Vine's search returns ten at most. */
export async function searchVolumes(query: string): Promise<ComicVolume[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  const body = await request<VolumeDoc[]>("search", {
    query: q,
    resources: "volume",
    field_list: VOLUME_FIELDS,
    limit: "10",
  });
  return (body?.results ?? []).flatMap((doc) => toVolume(doc) ?? []);
}

export async function getVolume(id: number): Promise<ComicVolume | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const body = await request<VolumeDoc>(`volume/4050-${id}`, { field_list: VOLUME_FIELDS });
  return body?.results ? toVolume(body.results) : null;
}

type IssueDoc = {
  id?: number;
  name?: string | null;
  issue_number?: string | null;
  cover_date?: string | null;
  store_date?: string | null;
  image?: Image;
  description?: string | null;
  deck?: string | null;
  site_detail_url?: string;
  volume?: { id?: number; name?: string } | null;
  person_credits?: { name?: string; role?: string }[];
};

export type ComicIssue = {
  id: number;
  /** As Comic Vine writes it: "1", "0.5", "1.MU". */
  issueNumber: string | null;
  name: string | null;
  year: number | null;
  thumbUrl: string | null;
};

function toIssue(doc: IssueDoc): ComicIssue | null {
  if (!Number.isInteger(doc.id)) return null;
  return {
    id: doc.id!,
    issueNumber: doc.issue_number?.trim() || null,
    name: doc.name?.trim() || null,
    year: year(doc.cover_date ?? doc.store_date),
    thumbUrl: image(doc.image, "small_url", "thumb_url", "medium_url"),
  };
}

/** How issue numbers sort: as numbers where they are ("2" before "10"), then as written. */
function byNumber(a: ComicIssue, b: ComicIssue): number {
  const na = Number.parseFloat(a.issueNumber ?? "");
  const nb = Number.parseFloat(b.issueNumber ?? "");
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
  return (a.issueNumber ?? "").localeCompare(b.issueNumber ?? "");
}

/**
 * A volume's issues, in number order. The first hundred: a trade paperback
 * run is a handful, and a long single-issue run is better searched by name
 * than scrolled.
 */
export async function volumeIssues(volumeId: number): Promise<ComicIssue[]> {
  if (!Number.isInteger(volumeId) || volumeId <= 0) return [];
  const body = await request<IssueDoc[]>("issues", {
    filter: `volume:${volumeId}`,
    field_list: "id,name,issue_number,cover_date,store_date,image",
    sort: "cover_date:asc",
    limit: "100",
  });
  return (body?.results ?? []).flatMap((doc) => toIssue(doc) ?? []).sort(byNumber);
}

export type ComicBook = ComicIssue & {
  volume: { id: number; name: string } | null;
  /** Writers, else everyone credited: who a comic is "by". */
  authors: string[];
  description: string | null;
  coverUrl: string | null;
  pageUrl: string | null;
};

/** One issue in full, for adding it: everything stored comes from this answer. */
export async function getIssue(id: number): Promise<ComicBook | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const body = await request<IssueDoc>(`issue/4000-${id}`, {
    field_list: "id,name,issue_number,cover_date,store_date,image,description,deck,site_detail_url,volume,person_credits",
  });
  const doc = body?.results;
  const issue = doc ? toIssue(doc) : null;
  if (!doc || !issue) return null;

  const credits = (doc.person_credits ?? []).filter((p) => p.name?.trim());
  const writers = credits.filter((p) => /writer/i.test(p.role ?? ""));
  const authors = [...new Set((writers.length ? writers : credits).map((p) => p.name!.trim()))].slice(0, 10);

  return {
    ...issue,
    volume: doc.volume?.id && doc.volume.name ? { id: doc.volume.id, name: doc.volume.name.trim() } : null,
    authors,
    description: (doc.description ? reviewText(doc.description) : null) ?? doc.deck?.trim() ?? null,
    coverUrl: image(doc.image, "original_url", "super_url", "medium_url"),
    pageUrl: doc.site_detail_url ?? null,
  };
}

/**
 * What an issue is called on the shelf. A one-issue volume is a graphic novel
 * and is its volume's name (its issue's name is often just "Volume 1");
 * otherwise the issue's own name where it has one ("Saga: Volume One"), else
 * its number ("Saga #12").
 */
export function comicTitle(volumeName: string, issue: Pick<ComicIssue, "name" | "issueNumber">, issueCount: number): string {
  if (issueCount === 1) return volumeName;
  if (issue.name) return `${volumeName}: ${issue.name}`;
  return issue.issueNumber ? `${volumeName} #${issue.issueNumber}` : volumeName;
}
