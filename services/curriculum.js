const { getCollections } = require('../config/database');

/**
 * Build curriculum structure from sections and lessons collections
 * @param {string} courseSlug - The course slug to build curriculum for
 * @returns {Promise<Array>} Array of sections with their lessons
 */
async function getCurriculum(courseSlug) {
  const { sectionsCol, lessonsCol } = getCollections();
  
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

module.exports = {
  getCurriculum
};