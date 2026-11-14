let cachedApp;

export default async function handler(req, res) {
  try {
    if (!cachedApp) {
      const mod = await import('../dist-server/index.mjs');
      cachedApp = mod.default;
    }
    return cachedApp(req, res);
  } catch (err) {
    console.error('Vercel function boot error:', err);
    res.status(500).json({
      error: 'Server boot failed',
      message: err?.message || String(err),
      stack: err?.stack,
    });
  }
}
