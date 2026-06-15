export default function handler(req, res) {
  res.status(403).json({
    error: "Free-data settings are managed with Vercel environment variables after deployment."
  });
}
