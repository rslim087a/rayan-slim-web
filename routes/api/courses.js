const express = require('express');
const router = express.Router();
const { getCollections } = require('../../config/database');
const { getCurriculum } = require('../../services/curriculum');

// Get collection handles
function getCoursesCollections() {
  const { coursesCol, sectionsCol, lessonsCol } = getCollections();
  return { coursesCol, sectionsCol, lessonsCol };
}

// ── List courses (lightweight) ────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { coursesCol } = getCoursesCollections();
    const courses = await coursesCol.find(
      {},
      {
        projection: {
          curriculum: 0,          // drop heavy arrays
          description: 0,         // homepage shows shortDescription only
          whatYoullLearn: 0
        }
      }
    ).toArray();

    res.json({ courses });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// ── Create or update a course meta document ─────────────────────────
router.post('/', async (req, res) => {
  try {
    if (!req.body.slug) {
      return res.status(400).json({ error: 'Course slug is required' });
    }
    
    const { coursesCol } = getCoursesCollections();
    const result = await coursesCol.replaceOne(
      { slug: req.body.slug },
      req.body,
      { upsert: true }
    );
    
    const action = result.upsertedCount > 0 ? 'created' : 'updated';
    res.json({ 
      success: true, 
      action,
      course: { slug: req.body.slug, title: req.body.title }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save course' });
  }
});

// ── Delete a course meta document ─────────────────────────
router.delete('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { coursesCol } = getCoursesCollections();
    const result = await coursesCol.deleteOne({ slug });
    if (!result.deletedCount) {
      return res.status(404).json({ error: 'Course not found' });
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// ── Get single course with curriculum ─────────────────────────
router.get('/:slug', async (req, res) => {
  try {
    const { coursesCol } = getCoursesCollections();
    const course = await coursesCol.findOne({ slug: req.params.slug });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const curriculum = await getCurriculum(course.slug);
    res.json({ ...course, curriculum });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// ── Get course curriculum only ─────────────────────────
router.get('/:slug/curriculum', async (req, res) => {
  try {
    const { coursesCol } = getCoursesCollections();
    const course = await coursesCol.findOne(
      { slug: req.params.slug },
      { projection: { title: 1 } }
    );
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const curriculum = await getCurriculum(course.slug);
    res.json({ curriculum, title: course.title });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch curriculum' });
  }
});

// ── Course Deployment (Reconciliation) ─────────────────── 
router.post('/:slug/deploy', async (req, res) => {
  try {
    const { slug } = req.params;
    const { course, sections } = req.body;
    
    if (!course || !course.slug || course.slug !== slug) {
      return res.status(400).json({ error: 'Invalid course data or slug mismatch' });
    }
    
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'Sections array is required' });
    }

    const { coursesCol, sectionsCol, lessonsCol } = getCoursesCollections();

    const changes = {
      course: null,
      sections: { added: [], updated: [], removed: [] },
      lessons: { added: [], updated: [], removed: [] }
    };

    // 1. Handle Course (always upsert)
    const courseResult = await coursesCol.replaceOne(
      { slug },
      course,
      { upsert: true }
    );
    changes.course = courseResult.upsertedCount > 0 ? 'created' : 'updated';

    // 2. Get current state from database
    const currentSections = await sectionsCol.find({ courseSlug: slug }).toArray();
    const currentLessons = await lessonsCol.find({ courseSlug: slug }).toArray();

    // 3. Process sections and collect all desired lessons globally
    const desiredSectionIndexes = new Set();
    const allDesiredLessons = new Map(); // slug -> lesson data with section
    
    for (const section of sections) {
      if (section.index === undefined || section.index === null) {
        return res.status(400).json({ error: `Section "${section.title}" missing index` });
      }
      
      desiredSectionIndexes.add(section.index);
      
      // Collect all desired lessons with their target sections
      if (section.lessons && Array.isArray(section.lessons)) {
        for (const lesson of section.lessons) {
          if (!lesson.slug) {
            return res.status(400).json({ error: `Lesson missing slug in section ${section.index}` });
          }
          allDesiredLessons.set(lesson.slug, {
            ...lesson,
            courseSlug: slug,
            sectionIndex: section.index
          });
        }
      }
    }

    // 4. Handle lessons globally first (before section processing)
    for (const [lessonSlug, lessonData] of allDesiredLessons) {
      const existing = currentLessons.find(l => l.slug === lessonSlug);
      
      if (existing) {
        // Update existing lesson (complete replacement)
        await lessonsCol.replaceOne(
          { courseSlug: slug, slug: lessonSlug },
          lessonData
        );
        changes.lessons.updated.push({
          slug: lessonData.slug,
          name: lessonData.name,
          section: lessonData.sectionIndex
        });
      } else {
        // Add new lesson
        await lessonsCol.insertOne(lessonData);
        changes.lessons.added.push({
          slug: lessonData.slug,
          name: lessonData.name,
          section: lessonData.sectionIndex
        });
      }
    }

    // 5. Remove lessons that are no longer desired (globally)
    for (const currentLesson of currentLessons) {
      if (!allDesiredLessons.has(currentLesson.slug)) {
        await lessonsCol.deleteOne({ courseSlug: slug, slug: currentLesson.slug });
        changes.lessons.removed.push({
          slug: currentLesson.slug,
          name: currentLesson.name,
          section: currentLesson.sectionIndex
        });
      }
    }

    // 6. Process sections (after lessons are handled)
    for (const section of sections) {
      const existing = currentSections.find(s => s.index === section.index);
      
      if (existing) {
        // Update existing section if title changed
        if (existing.title !== section.title) {
          await sectionsCol.updateOne(
            { courseSlug: slug, index: section.index },
            { $set: { title: section.title } }
          );
          changes.sections.updated.push({
            index: section.index,
            oldTitle: existing.title,
            newTitle: section.title
          });
        }
      } else {
        // Add new section
        await sectionsCol.insertOne({
          courseSlug: slug,
          index: section.index,
          title: section.title
        });
        changes.sections.added.push({
          index: section.index,
          title: section.title
        });
      }
    }

    // 7. Remove sections that are no longer desired
    const sectionsToRemove = currentSections.filter(s => 
      !desiredSectionIndexes.has(s.index)
    );
    
    for (const section of sectionsToRemove) {
      // Remove all lessons in this section first
      const lessonsInSection = currentLessons.filter(l => l.sectionIndex === section.index);
      for (const lesson of lessonsInSection) {
        await lessonsCol.deleteOne({ courseSlug: slug, slug: lesson.slug });
        changes.lessons.removed.push({
          slug: lesson.slug,
          name: lesson.name,
          section: section.index
        });
      }
      
      // Remove the section
      await sectionsCol.deleteOne({ courseSlug: slug, index: section.index });
      changes.sections.removed.push({
        index: section.index,
        title: section.title
      });
    }

    // 8. Return detailed change report
    res.json({
      success: true,
      course: course.title,
      changes,
      summary: {
        course: changes.course,
        sections: {
          total: sections.length,
          added: changes.sections.added.length,
          updated: changes.sections.updated.length,
          removed: changes.sections.removed.length
        },
        lessons: {
          total: sections.reduce((sum, s) => sum + (s.lessons?.length || 0), 0),
          added: changes.lessons.added.length,
          updated: changes.lessons.updated.length,
          removed: changes.lessons.removed.length
        }
      }
    });

  } catch (error) {
    console.error('Deploy error:', error);
    res.status(500).json({ error: 'Deployment failed', details: error.message });
  }
});

module.exports = router;