const ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

export type PostalLookupResult = { address: string; postalCode: string };

function titleCaseWords(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function pickOneMapRow(results: Array<Record<string, string>> | undefined) {
  if (!Array.isArray(results) || !results.length) return null;
  const generic = results.find((row) => !row.BUILDING || row.BUILDING === "NIL");
  return generic || results[0];
}

export function formatOneMapRow(row: Record<string, string> | null): string | null {
  if (!row) return null;
  const blk = String(row.BLK_NO || "").trim();
  const road = String(row.ROAD_NAME || "").trim();
  const building = String(row.BUILDING || "").trim();

  if (blk && blk !== "NIL" && road) {
    let line = `Blk ${blk} ${titleCaseWords(road)}`;
    if (building && building !== "NIL") line += ` (${titleCaseWords(building)})`;
    return line;
  }
  if (road) return titleCaseWords(road);

  const full = String(row.ADDRESS || "").trim();
  if (!full) return null;
  return full
    .replace(/\s+SINGAPORE\s+\d{6}$/i, "")
    .replace(/\s+\d{6}$/, "")
    .trim() || null;
}

export async function lookupSingaporePostalAddress(postalCode: string): Promise<PostalLookupResult | null> {
  const code = String(postalCode || "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) return null;

  const token = Deno.env.get("ONEMAP_API_TOKEN")?.trim();
  const url = new URL(ONEMAP_SEARCH_URL);
  url.searchParams.set("searchVal", code);
  url.searchParams.set("returnGeom", "N");
  url.searchParams.set("getAddrDetails", "Y");
  url.searchParams.set("pageNum", "1");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;

  const data = await res.json();
  const row = pickOneMapRow(data?.results);
  const address = formatOneMapRow(row);
  if (!address) return null;

  return { address, postalCode: code };
}
