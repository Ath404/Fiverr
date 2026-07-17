'use strict';

/**
 * Prototype API server. In production this sits behind an API gateway /
 * load balancer with the static frontend served from a CDN — see
 * docs/DEPLOYMENT.md. Kept intentionally dependency-light for the demo.
 */

const path = require('path');
const express = require('express');
const routes = require('./src/routes');

const app = express();
app.use(express.json());

// Basic security headers (production: use helmet + strict CSP + HSTS).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api', routes);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Serve the static demo frontend.
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Virtual casino prototype running on :${PORT}`));
}

module.exports = app;
