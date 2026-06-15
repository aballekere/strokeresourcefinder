import { readFile } from "node:fs/promises";
import {
  cleanZip,
  getDemoAdi,
  listSupabaseResources,
  matchesSelectedCategory,
  supabaseConfigured
} from "../lib/supabaseResources.js";

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const zip = cleanZip(url.searchParams.get("zip"));
  if (!zip) {
    res.status(400).json({ error: "Provide a five-digit ZIP code, for example /api/resources?zip=44106." });
    return;
  }

  const radiusMiles = Math.min(Number(url.searchParams.get("radius_miles") || 5), 25);
  const categories = (url.searchParams.get("categories") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const [trusted, mock, studentEntries] = await Promise.all([
      loadJson("../data/trusted-resources.json"),
      loadJson("../data/mock-places.json"),
      listSupabaseResources(zip, categories)
    ]);

    const trustedMatches = trusted
      .filter((resource) => resource.zipCodes.includes("*") || resource.zipCodes.includes(zip))
      .filter((resource) => matchesSelectedCategory(resource, categories))
      .map((resource) => ({
        ...resource,
        distanceMiles: null,
        source: "Trusted list"
      }));
    const mockMatches = mock.filter((resource) => matchesSelectedCategory(resource, categories));

    res.status(200).json({
      zip,
      radiusMiles,
      generatedAt: new Date().toISOString(),
      adi: getDemoAdi(zip),
      resources: [...trustedMatches, ...studentEntries, ...mockMatches],
      source: supabaseConfigured()
        ? "Trusted list + shared Supabase student entries + sample data"
        : "Trusted list + sample data. Configure Supabase environment variables for shared student entries."
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
}

async function loadJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}
