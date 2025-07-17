const express = require('express');
const router = express.Router();
const { getCollections } = require('../../config/database');

// Get collection handles
function getSubscriptionCollections() {
  const { emailsCol, suggestionsCol } = getCollections();
  return { emailsCol, suggestionsCol };
}

// ── Email subscription ───────────────────────────────────
router.post('/subscribe', async (req, res) => {
  const { email, slug = 'universal' } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });
  
  const { emailsCol } = getSubscriptionCollections();
  await emailsCol.updateOne(
    { email, slug },
    { $setOnInsert: { email, slug, createdAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

// ── Verify user access ───────────────────────────────────
router.post('/verify-access', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ hasAccess: false });
  
  const { emailsCol } = getSubscriptionCollections();
  const doc = await emailsCol.findOne({ email, slug: 'universal' });
  res.json({ hasAccess: !!doc });
});

// ── Course suggestions ───────────────────────────────────
router.post('/suggestion', async (req, res) => {
  try {
    const { suggestionsCol } = getSubscriptionCollections();
    await suggestionsCol.insertOne({ ...req.body, createdAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save suggestion' });
  }
});

module.exports = router;