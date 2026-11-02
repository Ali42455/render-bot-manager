// server.js
const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Render API Configuration
const RENDER_API_KEY = process.env.RENDER_API_KEY || 'YOUR_RENDER_API_KEY';
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || 'YOUR_SERVICE_ID';

const renderClient = axios.create({
    baseURL: 'https://api.render.com/v1',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RENDER_API_KEY}`
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Hel Xaaladda Service-ka (Get Status)
app.get('/api/status', async (req, res) => {
    try {
        const response = await renderClient.get(`/services/${RENDER_SERVICE_ID}`);
        res.json({ success: true, data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// 2. Trigger Deploy Cusub
app.post('/api/deploy', async (req, res) => {
    try {
        const response = await renderClient.post(`/services/${RENDER_SERVICE_ID}/deploys`);
        res.json({ success: true, message: 'Deploy si guul leh ayaa loo bilaabay!', data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// 3. Restart Service
app.post('/api/restart', async (req, res) => {
    try {
        const response = await renderClient.post(`/services/${RENDER_SERVICE_ID}/restart`);
        res.json({ success: true, message: 'Service-ka waa la restarted-gareeyay!', data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// 4. Suspend Service (Jooji Bot-ka)
app.post('/api/suspend', async (req, res) => {
    try {
        const response = await renderClient.post(`/services/${RENDER_SERVICE_ID}/suspend`);
        res.json({ success: true, message: 'Service-ka waa la joojiyay (Suspended)!', data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// 5. Resume Service (Abaar ama Kici Bot-ka)
app.post('/api/resume', async (req, res) => {
    try {
        const response = await renderClient.post(`/services/${RENDER_SERVICE_ID}/resume`);
        res.json({ success: true, message: 'Service-ka waa la kiciyay (Resumed)!', data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Render Management Dashboard running on http://localhost:${PORT}`);
});
