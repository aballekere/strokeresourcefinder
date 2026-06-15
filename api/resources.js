import { readFile } from "node:fs/promises";
import {
  cleanZip,
  getDemoAdi,
  getSupabaseAdi,
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
    const isSharedDeployment = supabaseConfigured();
    const [trusted, mock, studentEntries, adi] = await Promise.all([
      loadJson("../data/trusted-resources.json"),
      isSharedDeployment ? Promise.resolve([]) : loadJson("../data/mock-places.json"),
      listSupabaseResources(zip, categories),
      isSharedDeployment ? getSupabaseAdi(zip) : Promise.resolve(getDemoAdi(zip))
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
      adi,
      resources: [...trustedMatches, ...studentEntries, ...mockMatches],
      source: isSharedDeployment
        ? "Trusted list + shared Supabase student entries"
        : "Trusted list + sample data. Configure Supabase environment variables for shared student entries."
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
}

async function loadJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}
