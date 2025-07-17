const express = require('express');
const path = require('path');
const router = express.Router();

// ── Sitemap & About ───────────────────────────────────── 
const { generateSitemap } = require('../../sitemap.js');

router.get('/sitemap.xml', async (_, res) => {
  try {
    const xml = await generateSitemap();
    res.type('application/xml').send(xml);
  } catch (e) {
    console.error(e);
    res.status(500).send('Error generating sitemap');
  }
});

router.get('/about', (_, res) => res.sendFile(path.join(__dirname,'../../public','about.html')));

module.exports = router;