const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const BASE_URL = 'https://api.render.com/v1';

// Garabka u go'an la hadalka Render API
const headers = {
  'Authorization': `Bearer ${RENDER_API_KEY}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

// 1. Soo qaad dhammaan bots-ka/adeegyada ku jira Render
app.get('/api/services', async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}/services?limit=20`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday soo qaadista bots-ka' });
  }
});

// 2. Dib-u-bilow (Restart/Deploy) Bot gaar ah
app.post('/api/restart/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  try {
    const response = await fetch(`${BASE_URL}/services/${serviceId}/deploys`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ clearCache: 'do_not_clear' })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Cillad ayaa ka dhacday dib-u-bilowga bot-ka' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Website-ka maamulku wuxuu ka shaqeynayaa: http://localhost:${PORT}`);
});