export default function handler(req, res) {
  res.status(403).json({
    error: "Google settings are managed with Vercel environment variables after deployment."
  });
}
