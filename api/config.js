import { resourceQueries, supabaseConfigured } from "../lib/supabaseResources.js";

export default function handler(req, res) {
  res.status(200).json({
    categories: resourceQueries.map(({ key, label }) => ({ key, label })),
    liveGoogleEnabled: false,
    googleConfigured: false,
    liveOsmEnabled: false,
    liveAdiEnabled: false,
    sourceMode: "supabase",
    sqliteCacheEnabled: false,
    supabaseEnabled: supabaseConfigured(),
    cacheTtlDays: 7
  });
}
