const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BASE_URL = 'https://api.render.com/v1';

const headers = {
  'Authorization': `Bearer ${RENDER_API_KEY}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

// ---------- Ammaan: furaha sirta ah (ADMIN_PASSWORD) ----------
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Ka hortag isku day badan (10 isku day / 10 daqiiqo)
const fails = new Map();
function isBlocked(ip) {
  const f = fails.get(ip);
  return !!f && Date.now() <= f.until && f.n >= 10;
}
function registerFail(ip) {
  const now = Date.now();
  let f = fails.get(ip);
  if (!f || now > f.until) f = { n: 0, until: now + 10 * 60 * 1000 };
  f.n++;
  fails.set(ip, f);
}

app.use('/api', (req, res, next) => {
  if (!RENDER_API_KEY) {
    return res.status(500).json({ error: 'RENDER_API_KEY ma jiro. Ku dar Environment Variables.' });
  }
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD ma jiro. Ku dar Environment Variables.' });
  }
  if (isBlocked(req.ip)) {
    return res.status(429).json({ error: 'Isku day badan. 10 daqiiqo kadib ku soo noqo.' });
  }
  if (!safeEqual(req.get('x-admin-key') || '', ADMIN_PASSWORD)) {
    registerFail(req.ip);
    return res.status(401).json({ error: 'Furaha waa khalad' });
  }
  fails.delete(req.ip);
  next();
});

// Hubi ID-ga iyo magaca env var
app.param('id', (req, res, next, id) => {
  if (!/^(srv|crn)-[a-z0-9]+$/i.test(id)) {
    return res.status(400).json({ error: 'ID khalad ah' });
  }
  next();
});
app.param('key', (req, res, next, key) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return res.status(400).json({ error: 'Magaca variable-ka waa khalad' });
  }
  next();
});

// ---------- Caawiyayaal Render API ----------
async function renderApi(apiPath, options = {}) {
  const r = await fetch(BASE_URL + apiPath, { ...options, headers });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  if (!r.ok) {
    const err = new Error((data && (data.message || data.error)) || `Render API ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

function fail(res, err) {
  console.error('Cillad:', err.message);
  let code = 500;
  let msg = err.message;
  if (err.status === 401 || err.status === 403) {
    code = 502;
    msg = 'RENDER_API_KEY waa khalad ama waa dhacay';
  } else if (err.status === 429) {
    code = 429;
    msg = 'Render waa ku xaddiday codsiyada, daqiiqad sug';
  } else if (err.status >= 400 && err.status < 600) {
    code = err.status;
  }
  res.status(code).json({ error: msg });
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

// ---------- 1. Liiska bots-ka + xaaladda deploy-ga ugu dambeeyay ----------
app.get('/api/services', async (req, res) => {
  try {
    const list = await renderApi('/services?limit=100');
    const services = await inBatches(list || [], 8, async ({ service: s }) => {
      let deploy = null;
      try {
        const d = await renderApi(`/services/${s.id}/deploys?limit=1`);
        const x = d && d[0] && d[0].deploy;
        if (x) {
          deploy = {
            status: x.status,
            createdAt: x.createdAt,
            finishedAt: x.finishedAt,
            commit: x.commit && x.commit.message ? String(x.commit.message).split('\n')[0] : null
          };
        }
      } catch (e) { /* haddii deploy la waayo, wuu sii socdaa */ }
      const det = s.serviceDetails || {};
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        ownerId: s.ownerId,
        suspended: s.suspended === 'suspended',
        url: det.url || null,
        region: det.region || null,
        plan: det.plan || null,
        branch: s.branch || null,
        autoDeploy: s.autoDeploy || null,
        updatedAt: s.updatedAt,
        dashboardUrl: s.dashboardUrl || null,
        deploy
      };
    });
    res.json({ services });
  } catch (err) { fail(res, err); }
});

// ---------- 2. Restart ----------
app.post('/api/services/:id/restart', async (req, res) => {
  try {
    await renderApi(`/services/${req.params.id}/restart`, { method: 'POST' });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

// ---------- 3. Deploy cusub ----------
app.post('/api/services/:id/deploy', async (req, res) => {
  try {
    const clearCache = req.body && req.body.clearCache ? 'clear' : 'do_not_clear';
    const data = await renderApi(`/services/${req.params.id}/deploys`, {
      method: 'POST',
      body: JSON.stringify({ clearCache })
    });
    res.json({ ok: true, deploy: data });
  } catch (err) { fail(res, err); }
});

// ---------- 4. Jooji (Suspend) / Bilow (Resume) ----------
app.post('/api/services/:id/suspend', async (req, res) => {
  try {
    await renderApi(`/services/${req.params.id}/suspend`, { method: 'POST' });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

app.post('/api/services/:id/resume', async (req, res) => {
  try {
    await renderApi(`/services/${req.params.id}/resume`, { method: 'POST' });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

// ---------- 5. Tirtir ----------
app.delete('/api/services/:id', async (req, res) => {
  try {
    await renderApi(`/services/${req.params.id}`, { method: 'DELETE' });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

// ---------- 6. Logs ----------
app.get('/api/services/:id/logs', async (req, res) => {
  try {
    const ownerId = String(req.query.ownerId || '');
    if (!ownerId) return res.status(400).json({ error: 'ownerId lama helin' });
    const q = new URLSearchParams({ ownerId, limit: '150', direction: 'backward' });
    q.append('resource', req.params.id);
    const data = await renderApi('/logs?' + q.toString());
    const logs = ((data && data.logs) || []).map(l => ({ t: l.timestamp, m: l.message })).reverse();
    res.json({ logs });
  } catch (err) { fail(res, err); }
});

// ---------- 7. Environment variables ----------
app.get('/api/services/:id/env', async (req, res) => {
  try {
    const list = await renderApi(`/services/${req.params.id}/env-vars?limit=100`);
    const vars = (list || []).map(x => ({
      key: x.envVar.key,
      value: x.envVar.value == null ? '' : x.envVar.value
    }));
    res.json({ vars });
  } catch (err) { fail(res, err); }
});

app.put('/api/services/:id/env/:key', async (req, res) => {
  try {
    const value = req.body && typeof req.body.value === 'string' ? req.body.value : '';
    await renderApi(`/services/${req.params.id}/env-vars/${encodeURIComponent(req.params.key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value })
    });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

app.delete('/api/services/:id/env/:key', async (req, res) => {
  try {
    await renderApi(`/services/${req.params.id}/env-vars/${encodeURIComponent(req.params.key)}`, {
      method: 'DELETE'
    });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Website-ka maamulku wuxuu ka shaqeynayaa: http://localhost:${PORT}`);
});
