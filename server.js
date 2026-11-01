const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Node 18+ wuxuu leeyahay fetch; haddii kale node-fetch ayaa la isticmaalayaa
const fetchFn = globalThis.fetch || require('node-fetch');

const app = express();
app.use(express.json());

// ---------- Environment variables ----------
const {
  RENDER_API_KEY,
  BYBIT_API_KEY,
  BYBIT_API_SECRET,
  DASHBOARD_USER = 'admin',
  DASHBOARD_PASSWORD
} = process.env;

const BYBIT_BASE_URL = process.env.BYBIT_BASE_URL || 'https://api.bybit.com'; // testnet: https://api-testnet.bybit.com
const BYBIT_ACCOUNT_TYPE = process.env.BYBIT_ACCOUNT_TYPE || 'UNIFIED';       // account-ka classic: CONTRACT
const RENDER_URL = 'https://api.render.com/v1';
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// ---------- Password (ikhtiyaari, laakiin aad ayaa loo xiganayaa) ----------
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

if (DASHBOARD_PASSWORD) {
  app.use((req, res, next) => {
    const [type, encoded] = (req.headers.authorization || '').split(' ');
    if (type === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString();
      const idx = decoded.indexOf(':');
      const user = decoded.slice(0, idx);
      const pass = decoded.slice(idx + 1);
      if (safeEqual(user, DASHBOARD_USER) && safeEqual(pass, DASHBOARD_PASSWORD)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Cali Bot Manager"');
    res.status(401).send('Password ayaa loo baahan yahay');
  });
}

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const fail = (res, err, fallback) => {
  console.error('[API ERROR]', err.message);
  res.status(502).json({ error: err.message || fallback });
};

// ---------- Render API ----------
// Render wuxuu inta badan soo celiyaa jawaab madhan (202/204), sidaa darteed json() si taxadar leh ayaa loo akhriyaa
async function renderRequest(pathname, options = {}) {
  if (!RENDER_API_KEY) throw new Error('RENDER_API_KEY ma jiro (ku dar .env ama Render Environment)');

  const response = await fetchFn(`${RENDER_URL}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Render API cillad ${response.status}`);
  }
  return data;
}

function botStatus(service, deployStatus) {
  if (service.suspended === 'suspended') return 'stopped';
  if (['created', 'build_in_progress', 'update_in_progress', 'pre_deploy_in_progress'].includes(deployStatus)) return 'deploying';
  if (['build_failed', 'update_failed', 'pre_deploy_failed'].includes(deployStatus)) return 'failed';
  return 'running';
}

// 1. Soo qaad dhammaan bots-ka Render (iyo xaaladdooda dhabta ah)
app.get('/api/services', async (req, res) => {
  try {
    const list = await renderRequest('/services?limit=50');
    const services = (Array.isArray(list) ? list : []).map((item) => item.service || item);

    const bots = await Promise.all(services.map(async (s) => {
      let deployStatus = null;
      if (s.suspended !== 'suspended') {
        try {
          const deploys = await renderRequest(`/services/${s.id}/deploys?limit=1`);
          const first = Array.isArray(deploys) ? deploys[0] : null;
          deployStatus = first?.deploy?.status || first?.status || null;
        } catch (_) { /* haddii deploy status la waayo, 'running' ayaa la tusayaa */ }
      }
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        ownerId: s.ownerId,
        suspended: s.suspended === 'suspended',
        deployStatus,
        status: botStatus(s, deployStatus),
        url: s.dashboardUrl || null
      };
    }));

    res.json(bots);
  } catch (error) {
    fail(res, error, 'Cillad ayaa ka dhacday soo qaadista bots-ka');
  }
});

// 2. Shid Bot-ka (Resume / Start)
app.post('/api/start/:serviceId', async (req, res) => {
  try {
    await renderRequest(`/services/${req.params.serviceId}/resume`, { method: 'POST' });
    res.json({ success: true });
  } catch (error) {
    fail(res, error, 'Cillad ayaa ka dhacday shididda bot-ka');
  }
});

// 3. Dami Bot-ka (Suspend / Stop)
app.post('/api/stop/:serviceId', async (req, res) => {
  try {
    await renderRequest(`/services/${req.params.serviceId}/suspend`, { method: 'POST' });
    res.json({ success: true });
  } catch (error) {
    fail(res, error, 'Cillad ayaa ka dhacday daminta bot-ka');
  }
});

// 4. Dib u billow Bot-ka (Restart). Haddii bot-ku jiro damiyay, waa la shidayaa.
app.post('/api/restart/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  try {
    const service = await renderRequest(`/services/${serviceId}`);
    if (service?.suspended === 'suspended') {
      await renderRequest(`/services/${serviceId}/resume`, { method: 'POST' });
    } else {
      await renderRequest(`/services/${serviceId}/deploys`, {
        method: 'POST',
        body: JSON.stringify({ clearCache: 'do_not_clear' })
      });
    }
    res.json({ success: true });
  } catch (error) {
    fail(res, error, 'Cillad ayaa ka dhacday dib-u-bilowga bot-ka');
  }
});

// 5. TIRTIR BOT-KA (Delete Service)
app.delete('/api/delete/:serviceId', async (req, res) => {
  try {
    await renderRequest(`/services/${req.params.serviceId}`, { method: 'DELETE' });
    res.json({ success: true, message: 'Bot-ka si buuxda ayaa loo tirtiray' });
  } catch (error) {
    fail(res, error, 'Cillad ayaa ka dhacday tirtiridda bot-ka');
  }
});

// 6. Logs-ka bot-ka (Render console)
app.get('/api/logs/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  try {
    let ownerId = req.query.ownerId;
    if (!ownerId) {
      const service = await renderRequest(`/services/${serviceId}`);
      ownerId = service.ownerId;
    }

    const q = new URLSearchParams({ ownerId, limit: '100', direction: 'backward' });
    q.append('resource', serviceId);
    const data = await renderRequest(`/logs?${q.toString()}`);

    const logs = (data?.logs || [])
      .map((l) => ({ time: l.timestamp, message: l.message }))
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    res.json({ logs });
  } catch (error) {
    fail(res, error, 'Cillad ayaa ka dhacday soo qaadista logs-ka');
  }
});

// ---------- Bybit API (P/L, balance, positions) ----------
async function bybitGet(endpoint, params = {}) {
  const query = new URLSearchParams(params).toString();
  const timestamp = Date.now().toString();
  const recvWindow = '10000';
  const signature = crypto
    .createHmac('sha256', BYBIT_API_SECRET)
    .update(timestamp + BYBIT_API_KEY + recvWindow + query)
    .digest('hex');

  const response = await fetchFn(`${BYBIT_BASE_URL}${endpoint}${query ? '?' + query : ''}`, {
    headers: {
      'X-BAPI-API-KEY': BYBIT_API_KEY,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'X-BAPI-RECV-WINDOW': recvWindow
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Bybit HTTP ${response.status}. Haddii 403 yahay, server-kan gobolkiisa Bybit ayaa xanibay (u beddel Singapore ama Frankfurt)`);
  }
  if (data.retCode !== 0) throw new Error(`Bybit: ${data.retMsg} (${data.retCode})`);
  return data.result;
}

// Trades-ka xidhan ee 7-dii maalmood ee la soo dhaafay (xadka Bybit waa 7 maalmood)
async function fetchClosedPnl() {
  const endTime = Date.now();
  const startTime = endTime - (7 * 24 * 60 * 60 * 1000 - 60 * 1000);
  let cursor = '';
  const rows = [];

  for (let page = 0; page < 5; page++) {
    const params = { category: 'linear', limit: '100', startTime: String(startTime), endTime: String(endTime) };
    if (cursor) params.cursor = cursor;

    let result;
    try {
      result = await bybitGet('/v5/position/closed-pnl', params);
    } catch (err) {
      if (page === 0) throw err; // bog 1 hadduu fashilmo, cilladda tus
      break;                     // bogagga dambe hadday fashilmaan, waxa horey u soo baxay ayaa la hayaa
    }

    rows.push(...(result.list || []));
    cursor = result.nextPageCursor;
    if (!cursor || !(result.list || []).length) break;
  }

  return rows
    .map((t) => ({
      symbol: t.symbol,
      qty: num(t.qty),
      entry: num(t.avgEntryPrice),
      exit: num(t.avgExitPrice),
      pnl: num(t.closedPnl),
      leverage: t.leverage,
      time: Number(t.updatedTime || t.createdTime)
    }))
    .sort((a, b) => b.time - a.time);
}

// 7. Xogta account-ka: balance + positions furan + trades xidhan
app.get('/api/account', async (req, res) => {
  if (!BYBIT_API_KEY || !BYBIT_API_SECRET) {
    return res.json({
      configured: false,
      balance: null,
      positions: [],
      trades: [],
      errors: ['BYBIT_API_KEY iyo BYBIT_API_SECRET ku dar .env (ama Render Environment) si P/L loo arko']
    });
  }

  const [wallet, positions, trades] = await Promise.allSettled([
    bybitGet('/v5/account/wallet-balance', { accountType: BYBIT_ACCOUNT_TYPE }),
    bybitGet('/v5/position/list', { category: 'linear', settleCoin: 'USDT', limit: '200' }),
    fetchClosedPnl()
  ]);

  const errors = [];
  const out = { configured: true, balance: null, positions: [], trades: [], errors };

  if (wallet.status === 'fulfilled') {
    const acc = wallet.value.list?.[0];
    if (acc) {
      const usdt = (acc.coin || []).find((c) => c.coin === 'USDT');
      out.balance = {
        equity: num(acc.totalEquity ?? usdt?.equity),
        walletBalance: num(acc.totalWalletBalance ?? usdt?.walletBalance),
        unrealisedPnl: num(acc.totalPerpUPL ?? usdt?.unrealisedPnl),
        available: num(acc.totalAvailableBalance ?? usdt?.availableToWithdraw)
      };
    }
  } else {
    errors.push(`Balance: ${wallet.reason.message}`);
  }

  if (positions.status === 'fulfilled') {
    out.positions = (positions.value.list || [])
      .filter((p) => num(p.size) > 0)
      .map((p) => {
        const pnl = num(p.unrealisedPnl);
        const margin = num(p.positionIM);
        return {
          symbol: p.symbol,
          side: p.side,
          size: num(p.size),
          entry: num(p.avgPrice),
          mark: num(p.markPrice),
          pnl,
          roe: margin > 0 ? (pnl / margin) * 100 : 0,
          leverage: p.leverage,
          sl: num(p.stopLoss),
          tp: num(p.takeProfit)
        };
      });
  } else {
    errors.push(`Positions: ${positions.reason.message}`);
  }

  if (trades.status === 'fulfilled') {
    out.trades = trades.value;
  } else {
    errors.push(`Trades: ${trades.reason.message}`);
  }

  res.json(out);
});

// ---------- Trading Settings ----------
// 8. Kaydi Trading Settings (Leverage, Margin, Intervals)
app.post('/api/settings', (req, res) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(req.body || {}, null, 2));
    res.json({ success: true, settings: req.body });
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday kaydinta setimaha' });
  }
});

// 9. Soo qaad Trading Settings
app.get('/api/settings', (req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return res.json(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
    }
    res.json({});
  } catch (error) {
    res.json({});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server-ku wuxuu si buuxda ugu shaqaynayaa: http://localhost:${PORT}`);
  if (!DASHBOARD_PASSWORD) console.log('Digniin: DASHBOARD_PASSWORD lama dhigin, qof kasta oo URL-ka haysta ayaa bots-ka maamuli kara.');
});
