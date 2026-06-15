import { saveSupabaseStudentResource } from "../../lib/supabaseResources.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST to save a student resource." });
    return;
  }

  const payload = typeof req.body === "string"
    ? JSON.parse(req.body || "{}")
    : req.body || {};
  const result = await saveSupabaseStudentResource(payload);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(result.status).json({ ok: true, resource: result.resource });
}
