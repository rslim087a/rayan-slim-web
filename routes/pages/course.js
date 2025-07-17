const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { getCollections } = require('../../config/database');
const { getCurriculum } = require('../../services/curriculum');
const { generateCourseHeadBlock } = require('../../services/seo');

// ── Course Landing Page (SSR) ──────────────────────────── 
router.get('/course/:slug', async (req, res) => {
  try {
    const { coursesCol } = getCollections();
    const course = await coursesCol.findOne({ slug: req.params.slug });
    if (!course) return res.status(404).send('Course not found');

    const curriculum = await getCurriculum(course.slug);
    const base = fs.readFileSync(path.join(__dirname, '../../public', 'course.html'), 'utf8');

    // Check if user has access (server-side simulation - in reality you'd use session/cookies)
    // For now, we'll render both versions and let JavaScript handle the logic
    
    // Build sidebar with suggestion button at bottom
    const sidebar = `
      ${curriculum.map((sec, i) => `
        <details class="section" ${i === 0 ? 'open' : ''}>
          <summary>
            Section ${i + 1} – ${sec.title}
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
          </summary>
          <div class="lessons">
            ${sec.lessons.map((l, j) => `
              <div class="lesson" data-section="${i}" data-lesson="${j}" tabindex="0">
                <span class="lesson-number">L${j + 1}</span>
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

    // Build course landing content
    const landing = `
      <div class="course-landing-container">
        <header class="course-landing-header">
          <h1 class="course-landing-title">
            ${course.seoTitle || course.title}
          </h1>
          ${course.subtitle
            ? `<p class="course-landing-subtitle">${course.subtitle}</p>`
            : ''}
        </header>

        ${course.whatYoullLearn?.length
          ? `<section class="course-landing-section">
               <h2 class="course-landing-section-title">What You'll Learn</h2>
               <ul class="course-landing-list">
                 ${course.whatYoullLearn
                   .map(i => `<li class="course-landing-list-item">${i}</li>`)
                   .join('')}
               </ul>
             </section>`
          : ''}

        ${course.description
          ? `<section class="course-landing-section course-landing-description">
               <h2 class="course-landing-section-title">Description</h2>
               <p>${course.description.replace(/\n\n/g, '</p><p>')}</p>
             </section>`
          : ''}
      </div>
    `;

    // SEO head + JSON-LD + hydration
    const headBlock = generateCourseHeadBlock(course, curriculum);

    let html = base
      .replace('<title>Course Curriculum</title>', headBlock)
      .replace('<div id="sidebar"></div>', sidebar)
      .replace('<!--SSR_COURSE_LANDING-->', landing)
      .replace('<!--SSR_LESSON_BODY-->', ''); // Clear lesson body slot

    res.send(html);
  } catch (e) {
    console.error(e);
    res.status(404).send('Course not found');
  }
});

module.exports = router;