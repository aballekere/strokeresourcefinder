export const resourceQueries = [
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

export const categoryAliases = {
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

export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function cleanZip(value) {
  const match = String(value || "").match(/\b\d{5}\b/);
  return match ? match[0] : "";
}

export function selectedQueryForKey(categoryKey) {
  return resourceQueries.find((query) => query.key === categoryKey);
}

export function matchesSelectedCategory(resource, selectedCategories) {
  if (selectedCategories.length === 0) return true;
  const category = String(resource.category || "").toLowerCase();
  return selectedCategories.some((key) => {
    const aliases = categoryAliases[key] || [key];
    return aliases.some((alias) => category.includes(alias));
  });
}

export function getDemoAdi(zip) {
  const number = Number(zip);
  const mockAdi = 70 + (number % 35);
  return {
    ok: true,
    zip,
    geography: "ZCTA",
    year: 2022,
    source: "Demo estimate. Enable USE_SOCIOME_ADI=1 locally for live sociome output.",
    adi: mockAdi,
    financialStrength: 120 - (number % 25),
    economicHardshipAndInequality: mockAdi + 8,
    educationalAttainment: 80 + (number % 18)
  };
}

export function validateStudentPayload(payload) {
  const zip = cleanZip(payload.zip);
  const categoryKey = String(payload.categoryKey || "").trim();
  const query = selectedQueryForKey(categoryKey);
  const name = String(payload.name || "").trim();
  const address = String(payload.address || "").trim();
  const phone = String(payload.phone || "").trim();
  const website = String(payload.website || "").trim();
  const notes = String(payload.notes || "").trim();
  const createdBy = String(payload.createdBy || "").trim();

  if (!zip) return { ok: false, status: 400, error: "Enter a five-digit ZIP code." };
  if (!query) return { ok: false, status: 400, error: "Choose a valid category." };
  if (!name) return { ok: false, status: 400, error: "Enter the resource name." };
  if (!address) return { ok: false, status: 400, error: "Enter an address or phone/online service note." };
  if (!phone && !website && !notes) {
    return { ok: false, status: 400, error: "Add a phone, website, or note so counselors have a next step." };
  }

  return {
    ok: true,
    resource: {
      zip,
      categoryKey: query.key,
      category: query.label,
      name,
      address,
      phone,
      website,
      notes,
      createdBy
    }
  };
}

export async function listSupabaseResources(zip, categories = []) {
  if (!supabaseConfigured()) return [];

  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/resources`);
  url.searchParams.set("select", "*");
  url.searchParams.set("zip", `eq.${zip}`);
  url.searchParams.set("order", "created_at.desc");

  const response = await fetch(url, {
    headers: supabaseHeaders()
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase resource lookup failed with ${response.status}: ${error || "no details"}`);
  }

  const rows = await response.json();
  return rows
    .map(supabaseRowToResource)
    .filter((resource) => matchesSelectedCategory(resource, categories));
}

export async function getSupabaseAdi(zip) {
  if (!supabaseConfigured()) return null;

  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/adi_context`);
  url.searchParams.set("select", "*");
  url.searchParams.set("zip", `eq.${zip}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: supabaseHeaders()
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase ADI lookup failed with ${response.status}: ${error || "no details"}`);
  }

  const rows = await response.json();
  if (!rows[0]) {
    return {
      ok: false,
      zip,
      error: "No ADI context found in Supabase for this ZIP."
    };
  }

  return supabaseRowToAdi(rows[0]);
}

export async function saveSupabaseStudentResource(payload) {
  if (!supabaseConfigured()) {
    return { ok: false, status: 503, error: "Supabase is not configured." };
  }

  const validation = validateStudentPayload(payload);
  if (!validation.ok) return validation;

  const resource = validation.resource;
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/resources`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      "content-type": "application/json",
      prefer: "return=representation"
    },
    body: JSON.stringify({
      zip: resource.zip,
      category_key: resource.categoryKey,
      category: resource.category,
      name: resource.name,
      address: resource.address,
      phone: resource.phone,
      website: resource.website,
      notes: resource.notes,
      created_by: resource.createdBy,
      source: "Student entry"
    })
  });

  if (!response.ok) {
    const error = await response.text();
    return { ok: false, status: 502, error: `Supabase save failed: ${error || response.status}` };
  }

  const rows = await response.json();
  return {
    ok: true,
    status: 201,
    resource: supabaseRowToResource(rows[0])
  };
}

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function supabaseRowToResource(row) {
  return {
    id: row.id,
    zip: row.zip,
    categoryKey: row.category_key,
    category: row.category,
    name: row.name,
    address: row.address || "",
    phone: row.phone || "",
    website: row.website || "",
    notes: row.notes || "",
    createdBy: row.created_by || "",
    mapUrl: "",
    lat: null,
    lng: null,
    distanceMiles: null,
    source: row.source || "Student entry",
    fetchedAt: row.created_at
  };
}

function supabaseRowToAdi(row) {
  return {
    ok: true,
    zip: row.zip,
    geography: row.geography || "ZCTA",
    referenceArea: row.reference_area || "",
    year: row.year,
    source: row.source || "sociome",
    adi: row.adi,
    financialStrength: row.financial_strength,
    economicHardshipAndInequality: row.economic_hardship_and_inequality,
    educationalAttainment: row.educational_attainment,
    updatedAt: row.updated_at
  };
}
