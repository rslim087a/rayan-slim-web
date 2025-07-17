const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');

// Load environment variables FIRST
require('dotenv').config();

// Import configurations AFTER dotenv is loaded
const { connectDatabase } = require('./config/database');
const { configurePassport } = require('./config/passport');
const { configureMarked } = require('./config/marked');

// Import route modules
const coursesRoutes = require('./routes/api/courses');
const lessonsRoutes = require('./routes/api/lessons');
const sectionsRoutes = require('./routes/api/sections');
const authRoutes = require('./routes/api/auth');
const subscriptionRoutes = require('./routes/api/subscription');
const categoriesRoutes = require('./routes/api/categories');
const homepageRoutes = require('./routes/pages/homepage');
const coursePageRoutes = require('./routes/pages/course');
const lessonPageRoutes = require('./routes/pages/lesson');
const staticRoutes = require('./routes/pages/static');

/* ── Initialize configurations ─────────────────────────── */
configureMarked();
configurePassport();

/* ── Express app init ──────────────────────────────────── */
const app = express();
const PORT = process.env.PORT || 3000;

/* ── MongoDB connection ────────────────────────────────── */
(async () => {
  await connectDatabase();
  console.log('✅ Database collections initialized');
})().catch(err => console.error('Database initialization error:', err));

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

/* ── Mount Route Handlers ──────────────────────────────── */
// API Routes
app.use('/api/courses', coursesRoutes);
app.use('/api/lessons', lessonsRoutes);
app.use('/api', sectionsRoutes);  // sections routes include /courses/:slug/sections
app.use('/auth', authRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api', categoriesRoutes);

// SSR Page Routes
app.use('/', homepageRoutes);
app.use('/', coursePageRoutes);
app.use('/', lessonPageRoutes);
app.use('/', staticRoutes);

/* ── Start server ───────────────────────────────────────── */
app.listen(PORT, () => console.log(`🚀 Listening on http://localhost:${PORT}`));