const express = require('express');
const router = express.Router();
const { getCollections } = require('../../config/database');

// Get collection handles
function getCategoriesCollections() {
  const { categoryOrderCol } = getCollections();
  return { categoryOrderCol };
}

// ── Get category order ───────────────────────────────────
router.get('/category-order', async (req, res) => {
  try {
    const { categoryOrderCol } = getCategoriesCollections();
    const orderDoc = await categoryOrderCol.findOne({ id: 'default' });
    const order = orderDoc?.order || ['all']; // default fallback
    res.json({ order });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get category order' });
  }
});

// ── Set category order ───────────────────────────────────
router.put('/category-order', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array' });
    }
    
    const { categoryOrderCol } = getCategoriesCollections();
    await categoryOrderCol.replaceOne(
      { id: 'default' },
      { id: 'default', order, updatedAt: new Date() },
      { upsert: true }
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update category order' });
  }
});

module.exports = router;