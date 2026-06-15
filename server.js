import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  getSupabaseAdi,
  listSupabaseResources,
  saveSupabaseStudentResource,
  studentAccessRequired,
  supabaseConfigured,
  validateStudentPayload
} from "./lib/supabaseResources.js";

const root = process.cwd();
const publicDir = join(root, "public");
const dataDir = join(root, "data");

await loadDotEnv();
const database = await initDatabase();

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const cacheTtlDays = Number(process.env.CACHE_TTL_DAYS || 7);
const appUserAgent = process.env.APP_USER_AGENT || "StrokeResourceFinder/0.1 (+https://example.org/contact)";

const resourceQueries = [
  { key: "clinic", label: "Clinics", text: "community health clinic" },
  { key: "pharmacy", label: "Pharmacies", text: "pharmacy" },
  { key: "rehab", label: "Rehabilitation", text: "physical therapy rehabilitation" },
  { key: "food", label: "Food Assistance", text: "food pantry food assistance" },
  { key: "transport", label: "Transportation", text: "medical transportation paratransit" },
  { key: "senior", label: "Senior Services", text: "senior center aging services" },
  { key: "social", label: "Social Services", text: "social services community action" },
  { key: "library", label: "Libraries", text: "public library" },
  { key: "grocery", label: "Grocery Stores", text: "grocery store" },
  { key: "park", label: "Parks", text: "park" }
];

const categoryAliases = {
  clinic: ["clinic", "primary care", "health center"],
  pharmacy: ["pharmacy"],
  rehab: ["rehabilitation", "physical therapy", "occupational therapy"],
  food: ["food", "pantry", "meal"],
  transport: ["transport", "paratransit", "ride"],
  senior: ["senior", "aging"],
  social: ["social", "navigation", "community action"],
  library: ["library"],
  grocery: ["grocery", "supermarket"],
  park: ["park"]
};

const osmAllowedCategoryKeys = new Set(["library", "grocery", "park", "transport"]);

const osmTagQueries = {
  transport: [
    'node["public_transport"="station"]["addr:street"](around:RADIUS,LAT,LNG);',
    'way["public_transport"="station"]["addr:street"](around:RADIUS,LAT,LNG);',
    'node["railway"="station"]["addr:street"](around:RADIUS,LAT,LNG);',
    'way["railway"="station"]["addr:street"](around:RADIUS,LAT,LNG);'
  ],
  library: [
    'node["amenity"="library"]["addr:street"](around:RADIUS,LAT,LNG);',
    'way["amenity"="library"]["addr:street"](around:RADIUS,LAT,LNG);'
  ],
  grocery: [
    'node["shop"~"supermarket|grocery"]["addr:street"](around:RADIUS,LAT,LNG);',
    'way["shop"~"supermarket|grocery"]["addr:street"](around:RADIUS,LAT,LNG);'
  ],
  park: [
    'node["leisure"="park"]["addr:street"](around:RADIUS,LAT,LNG);',
    'way["leisure"="park"]["addr:street"](around:RADIUS,LAT,LNG);'
  ]
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function parseRequestUrl(req) {
  return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
}

function cleanZip(value) {
  const match = String(value || "").match(/\b\d{5}\b/);
  return match ? match[0] : "";
}

function haversineMiles(a, b) {
  const radiusMiles = 3958.8;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusMiles * Math.asin(Math.sqrt(h));
}

async function loadJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function initDatabase() {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    mkdirSync(dataDir, { recursive: true });
    const db = new DatabaseSync(join(dataDir, "resources.sqlite"));
    db.exec(`
      CREATE TABLE IF NOT EXISTS place_cache (
        id TEXT PRIMARY KEY,
        zip TEXT NOT NULL,
        category_key TEXT NOT NULL,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        website TEXT,
        lat REAL,
        lng REAL,
        distance_miles REAL,
        notes TEXT,
        created_by TEXT,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_place_cache_zip_category
        ON place_cache(zip, category_key, fetched_at);
    `);
    try {
      db.exec("ALTER TABLE place_cache ADD COLUMN distance_miles REAL;");
    } catch {
      // Column already exists.
    }
    try {
      db.exec("ALTER TABLE place_cache ADD COLUMN notes TEXT;");
    } catch {
      // Column already exists.
    }
    try {
      db.exec("ALTER TABLE place_cache ADD COLUMN created_by TEXT;");
    } catch {
      // Column already exists.
    }
    return db;
  } catch {
    return null;
  }
}

async function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;

  const lines = (await readFile(envPath, "utf8")).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

async function getAdi(zip) {
  if (supabaseConfigured()) {
    return getSupabaseAdi(zip);
  }

  if (process.env.USE_SOCIOME_ADI === "1") {
    const live = await getSociomeAdi(zip);
    if (live.ok) return live;
  }

  const number = Number(zip);
  const mockAdi = 70 + (number % 35);
  return {
    ok: true,
    zip,
    geography: "ZCTA",
    year: 2022,
    source: "Demo estimate. Enable USE_SOCIOME_ADI=1 for live sociome output.",
    adi: mockAdi,
    financialStrength: 120 - (number % 25),
    economicHardshipAndInequality: mockAdi + 8,
    educationalAttainment: 80 + (number % 18)
  };
}

function getSociomeAdi(zip) {
  return new Promise((resolveResult) => {
    const child = spawn("Rscript", [join(root, "scripts", "adi_sociome.R"), zip, "2022"], {
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolveResult({ ok: false, error: error.message });
    });
    child.on("close", () => {
      const lastLine = stdout.trim().split("\n").filter(Boolean).at(-1);
      try {
        resolveResult(JSON.parse(lastLine || "{}"));
      } catch {
        resolveResult({ ok: false, error: stderr || "Unable to parse R output." });
      }
    });
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "resource";
}

function selectedQueryForKey(categoryKey) {
  return resourceQueries.find((query) => query.key === categoryKey);
}

async function geocodeZip(zip) {
  if (!process.env.GOOGLE_MAPS_API_KEY || process.env.USE_GOOGLE_PLACES !== "1") {
    return { lat: 41.4993, lng: -81.6944, label: `${zip} demo center` };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", `${zip}, USA`);
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);
  const response = await fetch(url);
  const data = await response.json();
  const first = data.results?.[0];
  if (!first?.geometry?.location) {
    throw new Error(`Google Geocoding did not return a location for ${zip}.`);
  }
  return {
    lat: first.geometry.location.lat,
    lng: first.geometry.location.lng,
    label: first.formatted_address || zip
  };
}

async function getResources({ zip, categories, radiusMiles }) {
  const trusted = await loadJson("data/trusted-resources.json");
  const trustedMatches = trusted
    .filter((resource) => resource.zipCodes.includes("*") || resource.zipCodes.includes(zip))
    .filter((resource) => matchesSelectedCategory(resource, categories))
    .map((resource) => ({
      ...resource,
      distanceMiles: null,
      source: "Trusted list"
    }));

  const sourceMode = process.env.RESOURCE_SOURCE || "free";
  const liveGoogle = process.env.USE_GOOGLE_PLACES === "1" && process.env.GOOGLE_MAPS_API_KEY;
  const liveOsm = process.env.USE_OSM_OVERPASS === "1";
  const selectedQueries = resourceQueries.filter((query) => categories.length === 0 || categories.includes(query.key));
  const sharedEntries = sourceMode !== "google"
    ? await listSupabaseResources(zip, categories)
    : [];

  if (sourceMode !== "google") {
    const cached = await getCachedPlaces(zip, selectedQueries, radiusMiles);
    const studentEntries = cached.filter((resource) => resource.source === "Student entry");
    const allStudentEntries = [...sharedEntries, ...studentEntries];
    const refreshableCache = cached.filter((resource) => resource.source !== "Student entry");
    if (refreshableCache.length > 0 && !shouldRefreshCache(refreshableCache)) {
      return {
        resources: [...trustedMatches, ...allStudentEntries, ...refreshableCache],
        source: allStudentEntries.length > 0
          ? "Trusted list + student entries + local SQLite cache"
          : "Trusted list + local SQLite cache"
      };
    }

    if (liveOsm) {
      try {
        const center = await geocodeZipOpen(zip);
        const osmPlaces = await searchOpenStreetMap(zip, selectedQueries, center, radiusMiles);
        await cachePlaces(zip, osmPlaces);
        return {
          resources: [...trustedMatches, ...allStudentEntries, ...osmPlaces],
          source: allStudentEntries.length > 0
            ? "Trusted list + student entries + OpenStreetMap refresh"
            : "Trusted list + OpenStreetMap refresh"
        };
      } catch (error) {
        if (refreshableCache.length > 0 || allStudentEntries.length > 0) {
          return {
            resources: [...trustedMatches, ...allStudentEntries, ...refreshableCache],
            source: `Trusted list + local SQLite cache; OSM refresh failed: ${error.message}`
          };
        }
      }
    }

    if (sourceMode !== "auto" || !liveGoogle) {
      const mock = await loadJson("data/mock-places.json");
      const mockMatches = mock.filter((resource) => matchesSelectedCategory(resource, categories));
      return {
        resources: [...trustedMatches, ...allStudentEntries, ...mockMatches],
        source: allStudentEntries.length > 0
          ? "Trusted list + student entries + sample data. Enable OSM refresh or Google fallback for live results."
          : "Trusted list + sample data. Enable OSM refresh or Google fallback for live results."
      };
    }
  }

  if (!liveGoogle) {
    const mock = await loadJson("data/mock-places.json");
    const mockMatches = mock.filter((resource) => matchesSelectedCategory(resource, categories));
    return {
      resources: [...trustedMatches, ...mockMatches],
      source: "Google is selected but no key is configured; showing sample data."
    };
  }

  const center = await geocodeZip(zip);
  const batches = await Promise.all(
    selectedQueries.map((query) => searchGooglePlaces(query, center, radiusMiles))
  );
  const places = dedupePlaces(batches.flat()).sort((a, b) => {
    if (a.distanceMiles == null) return 1;
    if (b.distanceMiles == null) return -1;
    return a.distanceMiles - b.distanceMiles;
  });

  return {
    resources: [...trustedMatches, ...places],
    source: "Trusted list + Google Places"
  };
}

async function getCachedPlaces(zip, selectedQueries, radiusMiles) {
  if (!database) return [];
  const categoryKeys = new Set(selectedQueries.map((query) => query.key));
  const rows = database.prepare(`
    SELECT * FROM place_cache
    WHERE zip = ?
    ORDER BY fetched_at DESC, name ASC
  `).all(zip);
  return rows
    .filter((row) => categoryKeys.has(row.category_key))
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      address: row.address || "",
      phone: row.phone || "",
      website: row.website || "",
      notes: row.notes || "",
      createdBy: row.created_by || "",
      mapUrl: row.lat && row.lng
        ? `https://www.openstreetmap.org/?mlat=${row.lat}&mlon=${row.lng}#map=17/${row.lat}/${row.lng}`
        : "",
      lat: row.lat,
      lng: row.lng,
      distanceMiles: row.distance_miles == null ? null : row.distance_miles,
      source: row.source,
      fetchedAt: row.fetched_at
    }))
    .filter((row) => row.distanceMiles == null || row.distanceMiles <= radiusMiles);
}

function shouldRefreshCache(resources) {
  const oldest = resources
    .map((resource) => Date.parse(resource.fetchedAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  if (!oldest) return true;
  return Date.now() - oldest > cacheTtlDays * 24 * 60 * 60 * 1000;
}

async function cachePlaces(zip, places) {
  if (!database || places.length === 0) return;
  const statement = database.prepare(`
    INSERT OR REPLACE INTO place_cache
      (id, zip, category_key, category, name, address, phone, website, lat, lng, distance_miles, notes, created_by, source, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const fetchedAt = new Date().toISOString();
  for (const place of places) {
    statement.run(
      place.id,
      zip,
      place.categoryKey,
      place.category,
      place.name,
      place.address || "",
      place.phone || "",
      place.website || "",
      place.lat || null,
      place.lng || null,
      place.distanceMiles || null,
      place.notes || "",
      place.createdBy || "",
      place.source,
      fetchedAt
    );
  }
}

async function saveStudentResource(payload) {
  if (supabaseConfigured()) {
    return saveSupabaseStudentResource(payload);
  }

  if (!database) {
    return { ok: false, status: 503, error: "SQLite is unavailable on this Node runtime." };
  }

  const validation = validateStudentPayload(payload);
  if (!validation.ok) return validation;

  const { zip, categoryKey, category, name, address, phone, website, notes, createdBy } = validation.resource;
  const id = `student-${zip}-${categoryKey}-${slugify(name)}-${Date.now()}`;
  const fetchedAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO place_cache
      (id, zip, category_key, category, name, address, phone, website, lat, lng, distance_miles, notes, created_by, source, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    zip,
    categoryKey,
    category,
    name,
    address,
    phone,
    website,
    null,
    null,
    null,
    notes,
    createdBy,
    "Student entry",
    fetchedAt
  );

  return {
    ok: true,
    status: 201,
    resource: {
      id,
      zip,
      categoryKey: query.key,
      category: query.label,
      name,
      address,
      phone,
      website,
      notes,
      createdBy,
      source: "Student entry",
      fetchedAt
    }
  };
}

async function geocodeZipOpen(zip) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("postalcode", zip);
  url.searchParams.set("country", "USA");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { "user-agent": appUserAgent }
  });
  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}.`);
  }
  const data = await response.json();
  const first = data[0];
  if (!first?.lat || !first?.lon) {
    throw new Error(`No OSM geocode result for ${zip}.`);
  }
  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    label: first.display_name || `${zip}, USA`
  };
}

async function searchOpenStreetMap(zip, selectedQueries, center, radiusMiles) {
  const radiusMeters = Math.round(radiusMiles * 1609.34);
  const queryBlocks = selectedQueries
    .filter((query) => osmAllowedCategoryKeys.has(query.key))
    .flatMap((query) => (osmTagQueries[query.key] || []).map((block) => ({ ...query, block })));

  if (queryBlocks.length === 0) return [];

  const overpassQuery = `
    [out:json][timeout:25];
    (
      ${queryBlocks
        .map(({ block }) => block
          .replaceAll("RADIUS", String(radiusMeters))
          .replaceAll("LAT", String(center.lat))
          .replaceAll("LNG", String(center.lng)))
        .join("\n")}
    );
    out center tags 60;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": appUserAgent
    },
    body: new URLSearchParams({ data: overpassQuery })
  });
  if (!response.ok) {
    throw new Error(`Overpass returned ${response.status}.`);
  }
  const data = await response.json();
  return dedupePlaces((data.elements || [])
    .map((element) => osmElementToResource(element, selectedQueries, center))
    .filter(Boolean));
}

function osmElementToResource(element, selectedQueries, center) {
  const tags = element.tags || {};
  if (!tags.name || !tags["addr:street"]) return null;

  const lat = element.lat || element.center?.lat;
  const lng = element.lon || element.center?.lon;
  if (!lat || !lng) return null;

  const categoryKey = inferOsmCategory(tags, selectedQueries);
  if (!osmAllowedCategoryKeys.has(categoryKey)) return null;

  const query = resourceQueries.find((item) => item.key === categoryKey) || selectedQueries[0] || resourceQueries[0];
  const address = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"]
  ].filter(Boolean).join(", ");

  return {
    id: `osm-${element.type}-${element.id}`,
    categoryKey: query.key,
    category: query.label,
    name: tags.name,
    address,
    phone: tags.phone || tags["contact:phone"] || "",
    website: tags.website || tags["contact:website"] || "",
    mapUrl: lat && lng ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : "",
    lat,
    lng,
    distanceMiles: lat && lng ? Number(haversineMiles(center, { lat, lng }).toFixed(1)) : null,
    source: "OpenStreetMap"
  };
}

function inferOsmCategory(tags, selectedQueries) {
  const haystack = Object.values(tags).join(" ").toLowerCase();
  for (const query of selectedQueries) {
    const aliases = categoryAliases[query.key] || [query.key];
    if (aliases.some((alias) => haystack.includes(alias))) return query.key;
  }
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (tags.amenity === "library") return "library";
  if (tags.shop === "supermarket" || tags.shop === "grocery") return "grocery";
  if (tags.leisure === "park") return "park";
  if (tags.public_transport === "station" || tags.railway === "station") return "transport";
  if (tags.amenity === "clinic" || tags.healthcare) return "clinic";
  return selectedQueries[0]?.key || "social";
}

function matchesSelectedCategory(resource, selectedCategories) {
  if (selectedCategories.length === 0) return true;
  const category = String(resource.category || "").toLowerCase();
  return selectedCategories.some((key) => {
    const aliases = categoryAliases[key] || [key];
    return aliases.some((alias) => category.includes(alias));
  });
}

async function searchGooglePlaces(query, center, radiusMiles) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GOOGLE_MAPS_API_KEY,
      "x-goog-fieldmask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.location",
        "places.googleMapsUri",
        "places.businessStatus"
      ].join(",")
    },
    body: JSON.stringify({
      textQuery: `${query.text} near ${center.label}`,
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: Math.round(radiusMiles * 1609.34)
        }
      },
      maxResultCount: 8
    })
  });

  if (!response.ok) {
    throw new Error(`Google Places request failed with ${response.status}.`);
  }

  const data = await response.json();
  return (data.places || []).map((place) => {
    const location = place.location
      ? { lat: place.location.latitude, lng: place.location.longitude }
      : null;
    return {
      id: place.id,
      name: place.displayName?.text || "Unnamed place",
      category: query.label,
      address: place.formattedAddress || "",
      phone: place.nationalPhoneNumber || "",
      website: place.websiteUri || place.googleMapsUri || "",
      mapUrl: place.googleMapsUri || "",
      distanceMiles: location ? Number(haversineMiles(center, location).toFixed(1)) : null,
      source: "Google Places"
    };
  });
}

function dedupePlaces(resources) {
  const seen = new Set();
  return resources.filter((resource) => {
    const key = resource.id || `${resource.name}-${resource.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/config") {
    sendJson(res, 200, {
      categories: resourceQueries.map(({ key, label }) => ({ key, label })),
      liveGoogleEnabled: process.env.USE_GOOGLE_PLACES === "1" && Boolean(process.env.GOOGLE_MAPS_API_KEY),
      googleConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      liveOsmEnabled: process.env.USE_OSM_OVERPASS === "1",
      liveAdiEnabled: process.env.USE_SOCIOME_ADI === "1",
      sourceMode: process.env.RESOURCE_SOURCE || "free",
      sqliteCacheEnabled: Boolean(database),
      supabaseEnabled: supabaseConfigured(),
      studentAccessRequired: studentAccessRequired(),
      cacheTtlDays
    });
    return;
  }

  if (url.pathname === "/api/settings/google" && req.method === "POST") {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const apiKey = String(payload.apiKey || "").trim();
    const enabled = Boolean(payload.enabled);
    const sourceMode = String(payload.sourceMode || "auto");

    if (apiKey && apiKey.length < 20) {
      sendJson(res, 400, { error: "That Google API key looks too short." });
      return;
    }

    await updateEnvFile({
      GOOGLE_MAPS_API_KEY: apiKey || process.env.GOOGLE_MAPS_API_KEY || "",
      USE_GOOGLE_PLACES: enabled ? "1" : "0",
      RESOURCE_SOURCE: ["free", "auto", "google"].includes(sourceMode) ? sourceMode : "auto"
    });
    process.env.GOOGLE_MAPS_API_KEY = apiKey || process.env.GOOGLE_MAPS_API_KEY || "";
    process.env.USE_GOOGLE_PLACES = enabled ? "1" : "0";
    process.env.RESOURCE_SOURCE = ["free", "auto", "google"].includes(sourceMode) ? sourceMode : "auto";
    sendJson(res, 200, {
      ok: true,
      googleConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      liveGoogleEnabled: process.env.USE_GOOGLE_PLACES === "1" && Boolean(process.env.GOOGLE_MAPS_API_KEY),
      sourceMode: process.env.RESOURCE_SOURCE
    });
    return;
  }

  if (url.pathname === "/api/settings/free" && req.method === "POST") {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const osmEnabled = Boolean(payload.osmEnabled);
    await updateEnvFile({ USE_OSM_OVERPASS: osmEnabled ? "1" : "0" });
    process.env.USE_OSM_OVERPASS = osmEnabled ? "1" : "0";
    sendJson(res, 200, {
      ok: true,
      liveOsmEnabled: process.env.USE_OSM_OVERPASS === "1"
    });
    return;
  }

  if (url.pathname === "/api/resources/manual" && req.method === "POST") {
    try {
      const body = await readRequestBody(req);
      const result = await saveStudentResource(JSON.parse(body || "{}"));
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, result.status, { ok: true, resource: result.resource });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Unable to save resource." });
    }
    return;
  }

  if (url.pathname === "/api/resources") {
    const zip = cleanZip(url.searchParams.get("zip"));
    if (!zip) {
      sendJson(res, 400, { error: "Provide a five-digit ZIP code, for example /api/resources?zip=44106." });
      return;
    }

    const radiusMiles = Math.min(Number(url.searchParams.get("radius_miles") || 5), 25);
    const categories = (url.searchParams.get("categories") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const [adi, resources] = await Promise.all([
        getAdi(zip),
        getResources({ zip, categories, radiusMiles })
      ]);
      sendJson(res, 200, {
        zip,
        radiusMiles,
        generatedAt: new Date().toISOString(),
        adi,
        ...resources
      });
    } catch (error) {
      sendJson(res, 502, { error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: "Unknown API route." });
}

function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 20000) {
        req.destroy();
        rejectBody(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolveBody(body));
    req.on("error", rejectBody);
  });
}

async function updateEnvFile(updates) {
  const envPath = join(root, ".env");
  const existing = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter((line) => line.trim());
  const seen = new Set();
  const next = lines.map((line) => {
    const index = line.indexOf("=");
    if (index === -1 || line.trim().startsWith("#")) return line;
    const key = line.slice(0, index).trim();
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }
  await writeFile(envPath, `${next.join("\n")}\n`);
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(publicDir, `.${requestedPath}`);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };
  const body = await readFile(filePath);
  res.writeHead(200, { "content-type": contentTypes[extname(filePath)] || "application/octet-stream" });
  res.end(body);
}

createServer(async (req, res) => {
  const url = parseRequestUrl(req);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
}).listen(port, host, () => {
  console.log(`Stroke Resource Finder running at http://${host}:${port}`);
});
