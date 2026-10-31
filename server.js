const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const BASE_URL = 'https://api.render.com/v1';

const headers = {
  'Authorization': `Bearer ${RENDER_API_KEY}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

// 1. Soo qaad dhammaan bots-ka / services-ka Render
app.get('/api/services', async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}/services?limit=50`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday soo qaadista bots-ka' });
  }
});

// 2. Shid Bot-ka (Resume / Start)
app.post('/api/start/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  try {
    const response = await fetch(`${BASE_URL}/services/${serviceId}/resume`, {
      method: 'POST',
      headers
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday shididda bot-ka' });
  }
});

// 3. Dami Bot-ka (Suspend / Stop)
app.post('/api/stop/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  try {
    const response = await fetch(`${BASE_URL}/services/${serviceId}/suspend`, {
      method: 'POST',
      headers
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday daminta bot-ka' });
  }
});

// 4. Dib u billow Bot-ka (Restart / Clear Cache)
app.post('/api/restart/:serviceId', async (loopReq, loopRes) => {
  const { serviceId } = loopReq.params;
  const { clearCache } = loopReq.body;
  try {
    const response = await fetch(`${BASE_URL}/services/${serviceId}/deploys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ clearCache: clearCache ? 'clear' : 'do_not_clear' })
    });
    const data = await response.json();
    loopRes.json(data);
  } catch (error) {
    loopRes.status(500).json({ error: 'Cillad ayaa ka dhacday dib-u-bilowga bot-ka' });
  }
});

// 5. Quick Control ama Amarrada Guud
app.post('/api/control', async (req, res) => {
  const { action } = req.body;
  // Halkan waxaad ku dari kartaa nidaamka Start All / Stop All haddii loo baahdo
  res.json({ success: true, message: `Amarka ${action} waa la helay.` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server-ka maamulku wuxuu ka shaqeynayaa: http://localhost:${PORT}`);
});
