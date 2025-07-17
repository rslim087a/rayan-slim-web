const express = require('express');
const router = express.Router();
const { getCollections } = require('../../config/database');

// Get collection handles
function getSectionsCollections() {
  const { sectionsCol } = getCollections();
  return { sectionsCol };
}

// ── Create or update section ─────────────────────────────
router.post('/courses/:slug/sections', async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, index } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const { sectionsCol } = getSectionsCollections();
    
    // If no index provided, find the next available index
    let sectionIndex = index;
    if (sectionIndex === undefined) {
      const totalSections = await sectionsCol.countDocuments({ courseSlug: slug });
      sectionIndex = totalSections;
    }
    
    // Validate index is not negative
    if (sectionIndex < 0) {
      return res.status(400).json({ error: 'Index cannot be negative' });
    }
    
    // Check if section already exists at this courseSlug + index
    const existingSection = await sectionsCol.findOne({ 
      courseSlug: slug, 
      index: sectionIndex 
    });
    
    if (existingSection) {
      // Update existing section
      const result = await sectionsCol.updateOne(
        { courseSlug: slug, index: sectionIndex },
        { $set: { title } }
      );
      
      res.json({ 
        success: true, 
        action: 'updated',
        section: { index: sectionIndex, title }
      });
    } else {
      // Create new section - shift existing sections if needed
      const totalSections = await sectionsCol.countDocuments({ courseSlug: slug });
      
      if (sectionIndex < totalSections) {
        // Shift existing sections at this position and after
        await sectionsCol.updateMany(
          { courseSlug: slug, index: { $gte: sectionIndex } },
          { $inc: { index: 1 } }
        );
      }
      
      // Insert new section
      await sectionsCol.insertOne({ 
        courseSlug: slug, 
        index: sectionIndex, 
        title 
      });
      
      res.json({ 
        success: true, 
        action: 'created',
        section: { index: sectionIndex, title }
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save section' });
  }
});

module.exports = router;