const express       = require('express');
const path          = require('path');
const fs            = require('fs');
const cors          = require('cors');
const { MongoClient } = require('mongodb');
const session       = require('express-session');
const passport      = require('passport');
const GoogleStrategy= require('passport-google-oauth20').Strategy;
const GitHubStrategy= require('passport-github2').Strategy;
const { marked } = require('marked');   // CommonJS named export

require('dotenv').config();

/* ── Configure marked for GitHub-style rendering (simple) ──── */
marked.setOptions({
  gfm: true,                    // GitHub Flavored Markdown
  breaks: false,                // Don't convert \n to <br>
  headerIds: true,              // Add IDs to headers
  mangle: false,                // Don't mangle autolinked email addresses
  sanitize: false,              // Don't sanitize HTML
  smartLists: true,             // Use smarter list behavior
  smartypants: false,           // Don't use smart quotes
  xhtml: false                  // Don't output XHTML
});

/* ── Mongo & app init ───────────────────────────────────── */
const app  = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

/* ── MongoDB: create handles + indexes ───────────────────── */
let emailsCol, suggestionsCol, coursesCol;
let sectionsCol, lessonsCol, categoryOrderCol;      // new collections

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('zeroDevops');

  // main collections
  emailsCol      = db.collection('course_access');
  suggestionsCol = db.collection('course_suggestions');

  // new split model
  coursesCol     = db.collection('courses');   // meta only
  sectionsCol    = db.collection('sections');  // one per section
  lessonsCol     = db.collection('lessons');   // one per lesson
  categoryOrderCol = db.collection('category_order'); // category ordering

  /* indexes */
  await emailsCol.createIndex({ email: 1, slug: 1 }, { unique: true });
  await coursesCol.createIndex({ slug: 1 }, { unique: true });
  await sectionsCol.createIndex({ courseSlug: 1, index: 1 });
  await lessonsCol.createIndex({ courseSlug: 1, sectionIndex: 1 });
  await lessonsCol.createIndex({ slug: 1, courseSlug: 1 }, { unique: true });
  await categoryOrderCol.createIndex({ id: 1 }, { unique: true });

  console.log('✅  Mongo connected and indexes created');
})().catch(err => console.error('Mongo error:', err));


/* ── Express middleware ─────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((u, done) => done(null, u));
passport.deserializeUser((u, done) => done(null, u));

/* ── OAuth strategies (Google + GitHub) ─────────────────── */
passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  '/auth/google/callback'
  },
  (_, __, profile, done) => done(null, { email: profile.emails[0].value })
));

passport.use('github-dev', new GitHubStrategy({
    clientID:     process.env.GITHUB_CLIENT_ID_DEV,
    clientSecret: process.env.GITHUB_CLIENT_SECRET_DEV,
    callbackURL:  '/auth/github/callback',
    scope:        ['user:email']
  },
  (_, __, profile, done) => {
    const email = (profile.emails.find(e => e.primary) || profile.emails[0]).value;
    done(null, { email });
  }
));

passport.use('github-prod', new GitHubStrategy({
    clientID:     process.env.GITHUB_CLIENT_ID_PROD,
    clientSecret: process.env.GITHUB_CLIENT_SECRET_PROD,
    callbackURL:  '/auth/github/callback',
    scope:        ['user:email']
  },
  (_, __, profile, done) => {
    const email = (profile.emails.find(e => e.primary) || profile.emails[0]).value;
    done(null, { email });
  }
));

const pickGitHub = host =>
  host.startsWith('localhost') || host.startsWith('127.')
    ? 'github-dev'
    : 'github-prod';

/* ── OAuth routes ───────────────────────────────────────── */
app.get('/auth/google', passport.authenticate('google', { scope: ['email','profile'] }));
app.get('/auth/github', (req, res, next) =>
  passport.authenticate(pickGitHub(req.headers.host), { scope: ['user:email'] })(req, res, next)
);

function oauthCallback(req, res) {
  const email = req.user?.email;
  if (!email) return res.send('<h2>No email returned</h2>');
  emailsCol.updateOne(
    { email, slug: 'universal' },
    { $setOnInsert: { email, slug: 'universal', createdAt: new Date() } },
    { upsert: true }
  );
  const redirect = req.query.redirect || '/';
  res.send(`
    <script>
      localStorage.setItem('user_email', ${JSON.stringify(email)});
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth-success', email: ${JSON.stringify(email)} }, '*');
        window.close();
      }
      setTimeout(() => location.href = ${JSON.stringify(redirect)}, 200);
    </script>
  `);
}

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  oauthCallback
);

app.get('/auth/github/callback',
  (req, res, next) => passport.authenticate(pickGitHub(req.headers.host), { failureRedirect: '/' })(req, res, next),
  oauthCallback
);

/* ── Helper: build curriculum from sections + lessons ───── */
async function getCurriculum(courseSlug) {
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

/* ── Helper: generate category color from category name ──── */
function generateCategoryColor(categoryName) {
  // Simple hash function to generate consistent color from string
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    const char = categoryName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Professional color palette - predefined nice colors
  const professionalColors = [
    '#667eea', // Purple-blue
    '#f093fb', // Pink-purple  
    '#4facfe', // Light blue
    '#43e97b', // Green
    '#fa709a', // Pink-orange
    '#a8edea', // Mint
    '#ff9a9e', // Coral
    '#a18cd1', // Lavender
    '#ffecd2', // Peach
    '#ff8a80', // Salmon
    '#326ce5', // Blue (Kubernetes-like)
    '#2563eb', // Professional blue
    '#7c3aed', // Purple
    '#dc2626', // Red
    '#059669', // Emerald
    '#d97706', // Orange
    '#be185d', // Rose
    '#0891b2', // Cyan
  ];
  
  // Use hash to pick from professional palette
  const colorIndex = Math.abs(hash) % professionalColors.length;
  return professionalColors[colorIndex];
}
async function checkUserAccess(email) {
  if (!email) return false;
  const doc = await emailsCol.findOne({ email, slug: 'universal' });
  return !!doc;
}

/* ── API Endpoints ──────────────────────────────────────── */

// courses
// ── List courses (lightweight) ────────────────────────────
app.get('/api/courses', async (req, res) => {
  try {
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
app.post('/api/courses', async (req, res) => {
  try {
    if (!req.body.slug) {
      return res.status(400).json({ error: 'Course slug is required' });
    }
    
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
app.delete('/api/courses/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
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

app.get('/api/courses/:slug', async (req, res) => {
  try {
    const course = await coursesCol.findOne({ slug: req.params.slug });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const curriculum = await getCurriculum(course.slug);
    res.json({ ...course, curriculum });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// curriculum
app.get('/api/courses/:slug/curriculum', async (req, res) => {
  try {
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

// lessons
// single-lesson lookup (separate collection)
app.get('/api/lessons/:lessonSlug', async (req, res) => {
  try {
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

// subscribe & access
app.post('/api/subscribe', async (req, res) => {
  const { email, slug = 'universal' } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });
  await emailsCol.updateOne(
    { email, slug },
    { $setOnInsert: { email, slug, createdAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

app.post('/api/verify-access', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ hasAccess: false });
  const doc = await emailsCol.findOne({ email, slug: 'universal' });
  res.json({ hasAccess: !!doc });
});

// suggestions
app.post('/api/suggestion', async (req, res) => {
  try {
    await suggestionsCol.insertOne({ ...req.body, createdAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save suggestion' });
  }
});

/* ── Category Order Management ──────────────────────────── */
// Get category order
app.get('/api/category-order', async (req, res) => {
  try {
    const orderDoc = await categoryOrderCol.findOne({ id: 'default' });
    const order = orderDoc?.order || ['all']; // default fallback
    res.json({ order });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get category order' });
  }
});

// Set category order
app.put('/api/category-order', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array' });
    }
    
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

/* ── SEO / SSR Pages ────────────────────────────────────── */
// Home SSR
// ── Homepage (SSR) ────────────────────────────────────────
app.get('/', async (req, res) => {
  try {
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
      path.join(__dirname, 'public', 'index.html'),
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

    // Helper function to create readable category labels from slugs
    const createCategoryLabel = (categorySlug) => {
      if (categorySlug === 'all') return 'All Free Courses';
      
      // Convert slug to readable format
      return categorySlug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

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
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

/* ── Course Landing Page (SSR) ──────────────────────────── */
/* ── Course Landing Page (SSR) ──────────────────────────── */
app.get('/course/:slug', async (req, res) => {
  try {
    const course = await coursesCol.findOne({ slug: req.params.slug });
    if (!course) return res.status(404).send('Course not found');

    const curriculum = await getCurriculum(course.slug);
    const base = fs.readFileSync(path.join(__dirname, 'public', 'course.html'), 'utf8');

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
    const seoTitle = course.seoTitle || course.title;
    const metaDesc = course.metaDescription || course.description?.slice(0, 160) || '';
    const canonical = `https://rayanslim.com/course/${course.slug}`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Course",
      name: course.title,
      description: course.description || course.shortDescription || '',
      provider: {
        "@type": "Person", 
        name: "Rayan Slim",
        url: "https://rayanslim.com"
      },
      educationalLevel: course.level || "Beginner to Intermediate",
      courseMode: "Online",
      teaches: course.whatYoullLearn || [],
      numberOfCredits: curriculum.reduce((sum, sec) => sum + sec.lessons.length, 0),
      hasCourseInstance: {
        "@type": "CourseInstance",
        courseMode: "Online",
        instructor: {
          "@type": "Person",
          name: "Rayan Slim"
        }
      }
    };

    const headBlock = `
      <title>${seoTitle}</title>
      <meta name="description" content="${metaDesc}">
      <link rel="canonical" href="${canonical}">
      <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      <script>
        window.__INITIAL_DATA__ = ${JSON.stringify({ course, curriculum })}
      </script>
    `;

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

/* ── Lesson Page (SSR) ──────────────────────────────────── */
app.get('/course/:courseSlug/:lessonSlug', async (req, res) => {
  try {
    const { courseSlug, lessonSlug } = req.params;

    /* 1. Fetch course meta, lesson, section, and full curriculum */
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
    const title = lesson.seoTitle
      ? `${lesson.seoTitle} | ${course.title}`
      : `${lesson.name} | ${section.title} – ${course.title}`;

    const description = lesson.metaDescription
      || `Lesson "${lesson.name}" from the ${section.title} section.`;

    const canonical = `https://rayanslim.com${req.originalUrl}`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: lesson.name,
      description: lesson.metaDescription || `Learn ${lesson.name}`,
      educationalLevel: "Beginner",
      learningResourceType: "Tutorial",
      teaches: lesson.name,
      isPartOf: {
        "@type": "Course",
        name: course.title,
        url: `https://rayanslim.com/course/${courseSlug}`
      },
      author: {
        "@type": "Person",
        name: "Rayan Slim"
      }
    };

    const headBlock = `
      <title>${title}</title>
      <meta name="description" content="${description}">
      <link rel="canonical" href="${canonical}">
      <!-- GitHub Markdown CSS -->
      <link href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown.min.css" rel="stylesheet">
      <!-- Highlight.js -->
      <link href="https://cdn.jsdelivr.net/npm/highlight.js@11.8.0/styles/github.min.css" rel="stylesheet">
      <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.8.0/lib/common/index.min.js"></script>
      <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      <script>
        window.__INITIAL_DATA__ = ${JSON.stringify({
          course,
          curriculum,
          section,
          lesson,
          sectionIndex,
          lessonIndex
        })}
      </script>
    `;

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
      path.join(__dirname, 'public', 'course.html'),
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

/* ── Lesson CRUD (separate collection) ─────────────────── */

// CREATE or UPDATE lesson (upsert)
app.post('/api/courses/:slug/sections/:sIdx/lessons', async (req, res) => {
  try {
    const { slug, sIdx } = req.params;
    const lesson = { ...req.body, courseSlug: slug, sectionIndex: +sIdx };
    
    if (!lesson.slug) {
      return res.status(400).json({ error: 'Lesson slug is required' });
    }
    
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

// DELETE lesson
app.delete('/api/courses/:slug/lessons/:lSlug', async (req, res) => {
  try {
    const { slug, lSlug } = req.params;
    const result = await lessonsCol.deleteOne({ courseSlug: slug, slug: lSlug });
    if (!result.deletedCount)
      return res.status(404).json({ error: 'Lesson not found' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

// ── Create or update section ─────────────────────────────
app.post('/api/courses/:slug/sections', async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, index } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
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

/* ── Sitemap & About ───────────────────────────────────── */
const { generateSitemap } = require('./sitemap.js');
app.get('/sitemap.xml', async (_, res) => {
  try {
    const xml = await generateSitemap();
    res.type('application/xml').send(xml);
  } catch (e) {
    console.error(e);
    res.status(500).send('Error generating sitemap');
  }
});
app.get('/about', (_, res) => res.sendFile(path.join(__dirname,'public','about.html')));

/* ── Start server ───────────────────────────────────────── */
app.listen(PORT, () => console.log(`🚀 Listening on http://localhost:${PORT}`));

/* ── Course Deployment (Reconciliation) ─────────────────── */

// Deploy entire course with reconciliation
app.post('/api/courses/:slug/deploy', async (req, res) => {
  try {
    const { slug } = req.params;
    const { course, sections } = req.body;
    
    if (!course || !course.slug || course.slug !== slug) {
      return res.status(400).json({ error: 'Invalid course data or slug mismatch' });
    }
    
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'Sections array is required' });
    }

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

// Updated all endpoints to use upsert pattern - no more PUT endpoints needed