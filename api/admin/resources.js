import {
  listPendingSupabaseResources,
  reviewSupabaseResource
} from "../../lib/supabaseResources.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const result = await listPendingSupabaseResources(url.searchParams.get("adminToken"));
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json({ ok: true, resources: result.resources });
    return;
  }

  if (req.method === "POST") {
    const payload = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};
    const result = await reviewSupabaseResource(payload);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json({ ok: true, resource: result.resource });
    return;
  }

  res.status(405).json({ error: "Use GET to list pending resources or POST to review one." });
}
