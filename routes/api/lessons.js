const express = require('express');
const router = express.Router();
const { getCollections } = require('../../config/database');

// Get collection handles
function getLessonsCollections() {
  const { lessonsCol, coursesCol, sectionsCol } = getCollections();
  return { lessonsCol, coursesCol, sectionsCol };
}

// ── Single lesson lookup (separate collection) ──────────────
router.get('/:lessonSlug', async (req, res) => {
  try {
    const { lessonsCol, coursesCol, sectionsCol } = getLessonsCollections();
    const lesson = await lessonsCol.findOne({ slug: req.params.lessonSlug });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const [course, section] = await Promise.all([
      coursesCol.findOne({ slug: lesson.courseSlug }, { projection: { title: 1 } }),
      sectionsCol.findOne({ courseSlug: lesson.courseSlug, index: lesson.sectionIndex })
    ]);

    res.json({
      lesson,
      section,
      sectionIndex: lesson.sectionIndex,
      lessonIndex: null,           // client can compute if needed
      courseSlug: lesson.courseSlug,
      courseTitle: course?.title || ''
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// ── CREATE or UPDATE lesson (upsert) ─────────────────────
router.post('/courses/:slug/sections/:sIdx/lessons', async (req, res) => {
  try {
    const { slug, sIdx } = req.params;
    const lesson = { ...req.body, courseSlug: slug, sectionIndex: +sIdx };
    
    if (!lesson.slug) {
      return res.status(400).json({ error: 'Lesson slug is required' });
    }
    
    const { lessonsCol } = getLessonsCollections();
    
    // Use replaceOne with upsert to create or update
    const result = await lessonsCol.replaceOne(
      { courseSlug: slug, slug: lesson.slug },
      lesson,
      { upsert: true }
    );
    
    const action = result.upsertedCount > 0 ? 'created' : 'updated';
    res.json({ 
      success: true, 
      action,
      lesson: { slug: lesson.slug, name: lesson.name }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save lesson' });
  }
});

// ── DELETE lesson ─────────────────────────────────────────
router.delete('/courses/:slug/lessons/:lSlug', async (req, res) => {
  try {
    const { slug, lSlug } = req.params;
    const { lessonsCol } = getLessonsCollections();
    const result = await lessonsCol.deleteOne({ courseSlug: slug, slug: lSlug });
    if (!result.deletedCount)
      return res.status(404).json({ error: 'Lesson not found' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

module.exports = router;