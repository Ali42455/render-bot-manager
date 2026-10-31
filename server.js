const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
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

// Local storage settings cache file
const SETTINGS_FILE = './settings.json';

// 1. Soo qaad dhammaan bots-ka Render
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

// 4. Dib u billow Bot-ka (Restart)
app.post('/api/restart/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  try {
    const response = await fetch(`${BASE_URL}/services/${serviceId}/deploys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ clearCache: 'do_not_clear' })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday dib-u-bilowga bot-ka' });
  }
});

// 5. TIRTIR BOT-KA (Delete Service)
app.delete('/api/delete/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  try {
    const response = await fetch(`${BASE_URL}/services/${serviceId}`, {
      method: 'DELETE',
      headers
    });
    if (response.ok) {
      res.json({ success: true, message: 'Bot-ka si buuxda ayaa loo tirtiray' });
    } else {
      const errData = await response.json();
      res.status(400).json(errData);
    }
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday tirtiridda bot-ka' });
  }
});

// 6. Kaydi Trading Settings (Leverage, Margin, Intervals)
app.post('/api/settings', (req, res) => {
  const newSettings = req.body;
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
    res.json({ success: true, settings: newSettings });
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday kaydinta setimaha' });
  }
});

// 7. Soo qaad Trading Settings
app.get('/api/settings', (req, res) => {
  if (fs.existsSync(SETTINGS_FILE)) {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    res.json(settings);
  } else {
    res.json({});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server-ku wuxuu si buuxda ugu shaqaynayaa: http://localhost:${PORT}`);
});
