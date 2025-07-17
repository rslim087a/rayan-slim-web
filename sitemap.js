// sitemap.js - Dynamic sitemap generation from database
const { MongoClient } = require('mongodb');

const PROD_BASE = 'https://rayanslim.com';
const MONGODB_URI = process.env.MONGODB_URI;

// Helper: build curriculum from sections + lessons (same as server.js)
async function getCurriculum(courseSlug, sectionsCol, lessonsCol) {
  const sections = await sectionsCol
    .find({ courseSlug })
    .sort({ index: 1 })
    .toArray();

  const lessons = await lessonsCol
    .find({ courseSlug })
    .sort({ sectionIndex: 1 })
    .toArray();

  return sections.map(sec => ({
    title: sec.title,
    lessons: lessons
      .filter(lsn => lsn.sectionIndex === sec.index)
      .map(lsn => ({
        name: lsn.name,
        slug: lsn.slug,
        seoTitle: lsn.seoTitle,
        metaDescription: lsn.metaDescription,
        body: lsn.body,
        isMarkdown: lsn.isMarkdown
      }))
  }));
}

async function generateSitemap() {
  const urls = [];
  
  try {
    // Connect to database
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('zeroDevops');
    
    const coursesCol = db.collection('courses');
    const sectionsCol = db.collection('sections');
    const lessonsCol = db.collection('lessons');

    // Add static pages
    urls.push(`<url><loc>${PROD_BASE}/</loc></url>`);
    urls.push(`<url><loc>${PROD_BASE}/about</loc></url>`);

    // Get all courses from database
    const courses = await coursesCol.find({}).toArray();

    for (const course of courses) {
      // Add course landing page
      urls.push(`<url><loc>${PROD_BASE}/course/${course.slug}</loc></url>`);

      // Get curriculum for this course using the same logic as server.js
      const curriculum = await getCurriculum(course.slug, sectionsCol, lessonsCol);

      // Add lesson pages
      curriculum.forEach(section => {
        if (section.lessons && Array.isArray(section.lessons)) {
          section.lessons.forEach(lesson => {
            urls.push(`<url><loc>${PROD_BASE}/course/${course.slug}/${lesson.slug}</loc></url>`);
          });
        }
      });
    }

    await client.close();
  } catch (error) {
    console.error('Error generating sitemap:', error);
    // Fallback to static pages only if database fails
    urls.length = 0; // Clear any partial data
    urls.push(`<url><loc>${PROD_BASE}/</loc></url>`);
    urls.push(`<url><loc>${PROD_BASE}/about</loc></url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.join('\n  ')}
</urlset>`;
}

module.exports = { generateSitemap };