const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { getCollections } = require('../../config/database');
const { getCurriculum } = require('../../services/curriculum');
const { generateLessonHeadBlock } = require('../../services/seo');
const { marked } = require('../../config/marked');

// ── Lesson Page (SSR) ──────────────────────────────────── 
router.get('/course/:courseSlug/:lessonSlug', async (req, res) => {
  try {
    const { courseSlug, lessonSlug } = req.params;

    /* 1. Fetch course meta, lesson, section, and full curriculum */
    const { coursesCol, lessonsCol, sectionsCol } = getCollections();
    const course = await coursesCol.findOne({ slug: courseSlug });
    if (!course) return res.status(404).send('Course not found');

    const lesson = await lessonsCol.findOne({ courseSlug, slug: lessonSlug });
    if (!lesson) return res.status(404).send('Lesson not found');

    const section = await sectionsCol.findOne({
      courseSlug,
      index: lesson.sectionIndex
    });

    const curriculum = await getCurriculum(courseSlug);

    /* 2. Identify lesson position for SEO & sidebar highlight */
    const sectionIndex = lesson.sectionIndex;
    const lessonIndex = curriculum[sectionIndex]
      ? curriculum[sectionIndex].lessons.findIndex(l => l.slug === lessonSlug)
      : 0;

    // Calculate previous and next lessons
    const currentSection = curriculum[sectionIndex];
    const prev = lessonIndex > 0
      ? { s: sectionIndex, l: lessonIndex - 1 }
      : sectionIndex > 0
        ? { s: sectionIndex - 1, l: curriculum[sectionIndex - 1].lessons.length - 1 }
        : null;
    
    const next = lessonIndex + 1 < currentSection.lessons.length
      ? { s: sectionIndex, l: lessonIndex + 1 }
      : sectionIndex + 1 < curriculum.length
        ? { s: sectionIndex + 1, l: 0 }
        : null;

    /* 3. Build SEO <head> block */
    const headBlock = generateLessonHeadBlock(
      lesson, course, section, curriculum, 
      sectionIndex, lessonIndex, req.originalUrl
    );

    /* 4. Build sidebar HTML from the curriculum array */
    const sidebarHtml = `
      ${curriculum.map((sec, sIdx) => `
        <details class="section" ${sIdx === sectionIndex ? 'open' : ''}>
          <summary>
            Section ${sIdx + 1} – ${sec.title}
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
          </summary>
          <div class="lessons">
            ${sec.lessons.map((l, lIdx) => `
              <div
                class="lesson${sIdx === sectionIndex && lIdx === lessonIndex ? ' active' : ''}"
                data-section="${sIdx}"
                data-lesson="${lIdx}"
                tabindex="0"
              >
                <span class="lesson-number">L${lIdx + 1}</span>
                <span>${l.name}</span>
              </div>
            `).join('')}
          </div>
        </details>
      `).join('')}
      
      <div class="sidebar-footer" style="margin-top: 2rem; padding: 1.5rem; border-top: 1px solid var(--border-light);">
        <button id="suggestion-btn" class="btn btn-secondary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          💡 Suggest Improvements
        </button>
      </div>
    `;

    /* 5. Convert Markdown body to HTML if needed */
    const bodyHtml = lesson.body
      ? lesson.isMarkdown
        ? `<div class="markdown-body">${marked(lesson.body)}</div>
           <script>
             document.addEventListener('DOMContentLoaded', () => {
               // Highlight code blocks
               document.querySelectorAll('pre code').forEach(block => {
                 hljs.highlightElement(block);
               });
             });
           </script>`
        : lesson.body
      : '<p style="color: var(--text-light)">No content yet.</p>';

    /* 6. Build complete lesson content with navigation only */
    const lessonContent = `
      <div class="lesson-content">
        <h1>${lesson.seoTitle || lesson.name}</h1>
        ${bodyHtml}
        <div class="lesson-actions">
          ${prev ? `<button class="btn btn-secondary prev-lesson-btn" data-s="${prev.s}" data-l="${prev.l}">Previous Lesson</button>` : ''}
          ${next ? `<button class="btn btn-secondary next-lesson-btn" data-s="${next.s}" data-l="${next.l}">Next Lesson</button>` : '<span class="course-complete">🎉 Course Complete!</span>'}
        </div>
      </div>
    `;

    /* 7. Read template and inject pieces */
    const template = fs.readFileSync(
      path.join(__dirname, '../../public', 'course.html'),
      'utf8'
    );

    const full = template
      .replace('<title>Course Curriculum</title>', headBlock)
      .replace('<div id="sidebar"></div>', sidebarHtml)
      .replace('<!--SSR_COURSE_LANDING-->', '') /* clear landing slot */
      .replace('<!--SSR_LESSON_BODY-->', lessonContent);

    res.send(full);
  } catch (err) {
    console.error('Error rendering lesson page:', err);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;