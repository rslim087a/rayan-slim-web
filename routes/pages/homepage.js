const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { getCollections } = require('../../config/database');
const { generateCategoryColor } = require('../../services/colors');
const { createCategoryLabel } = require('../../services/seo');

// ── Homepage (SSR) ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { coursesCol, categoryOrderCol } = getCollections();
    const courses = await coursesCol.find(
      {},
      {
        projection: {
          curriculum: 0,
          description: 0,
          whatYoullLearn: 0
        }
      }
    ).toArray();

    let html = fs.readFileSync(
      path.join(__dirname, '../../public', 'index.html'),
      'utf8'
    );

    // Generate course cards with dynamic colors
    const cards = courses
      .map(c => {
        const categoryColor = generateCategoryColor(c.category || 'default');
        return `
        <a href="/course/${c.slug}" class="course-card ${c.category ? c.category.toLowerCase().replace(/\s+/g, '-') : 'uncategorized'}" tabindex="0" data-slug="${c.slug}">
          <div class="course-header">
            <div class="course-icon" style="background: ${categoryColor}; color: white;">
              ${c.title.charAt(0)}
            </div>
            <div class="course-content">
              <h3 class="course-title">${c.title}</h3>
              <p class="course-description">${c.shortDescription || ''}</p>
            </div>
          </div>
        </a>
      `;
      })
      .join('');

    // Generate categories dynamically from actual course data
    const categoryCount = {};
    
    // Count courses per category
    courses.forEach(course => {
      if (course.category) {
        categoryCount[course.category] = (categoryCount[course.category] || 0) + 1;
      }
    });

    // Add "all" category count
    categoryCount.all = courses.length;

    // Generate filter chips HTML - only show categories that have courses
    // Get category order from database
    let categoryOrder = ['all']; // fallback
    try {
      const orderDoc = await categoryOrderCol.findOne({ id: 'default' });
      if (orderDoc?.order) {
        categoryOrder = orderDoc.order;
      }
    } catch (e) {
      console.warn('Failed to load category order, using default:', e);
    }

    const filters = Object.entries(categoryCount)
      .filter(([key, count]) => count > 0)
      .sort(([a], [b]) => {
        const aIndex = categoryOrder.indexOf(a);
        const bIndex = categoryOrder.indexOf(b);
        
        // If category not in order list, put it at the end
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        
        return aIndex - bIndex;
      })
      .map(([key, count]) => {
        const slugKey = key === 'all' ? 'all' : key.toLowerCase().replace(/\s+/g, '-');
        return `
          <span class="filter-chip ${key === 'all' ? 'active' : ''}" data-category="${slugKey}" tabindex="0">
            ${createCategoryLabel(key)}
            <span class="chip-count">${count}</span>
          </span>
        `;
      }).join('');
      
    // Inject SSR data for JavaScript
    const initialData = `
      <script>
        window.__INITIAL_DATA__ = ${JSON.stringify({ courses })}
      </script>
    `;

    // Replace placeholders in HTML
    html = html.replace('<!--SSR_COURSES-->', cards);
    html = html.replace('<div class="filters" id="filters"></div>', 
                       `<div class="filters" id="filters">${filters}</div>`);
    html = html.replace('</head>', `${initialData}</head>`);

    res.send(html);
  } catch (e) {
    console.error(e);
    res.sendFile(path.join(__dirname, '../../public', 'index.html'));
  }
});

module.exports = router;