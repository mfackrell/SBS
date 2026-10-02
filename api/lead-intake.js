const MAX_BODY_BYTES = 64_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, lead_id: null });
  }

  const portalUrl = process.env.PORTAL_LEAD_INTAKE_URL;
  const sharedSecret = process.env.LEAD_INGEST_SHARED_SECRET;

  if (!portalUrl || !sharedSecret) {
    console.error("lead_proxy_not_configured");
    return res.status(503).json({ ok: false, lead_id: null });
  }

  const body = req.body ?? {};
  const serialized = JSON.stringify(body);

  if (Buffer.byteLength(serialized, "utf8") > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, lead_id: null });
  }

  const forwardedFor = String(req.headers["x-forwarded-for"] ?? "");
  const clientIp = forwardedFor.split(",")[0].trim() || String(req.headers["x-real-ip"] ?? "unknown");

  try {
    const upstream = await fetch(portalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SBS-Lead-Secret": sharedSecret,
        "X-SBS-Client-IP": clientIp,
        "User-Agent": String(req.headers["user-agent"] ?? ""),
      },
      body: serialized,
    });

    const payload = await upstream.json().catch(() => ({ ok: false, lead_id: null }));

    res.setHeader("Cache-Control", "no-store");
    return res.status(upstream.status).json(payload);
  } catch (error) {
    console.error("lead_proxy_failed", error);
    return res.status(503).json({ ok: false, lead_id: null });
  }
}
