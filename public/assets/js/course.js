/**
 * Course Page JavaScript – Database-driven, no hardcoded course data
 * • Each lesson lives at /course/<courseSlug>/<lessonSlug>
 * • history.pushState keeps SPA feel
 * • Landing directly on a lesson URL uses SSR body if present, otherwise JS-rendered
 * • REMOVED: All lesson completion tracking (tacky UX removed)
 * • KEPT: Basic engagement tracking for analytics
 */

import { api, toTitle } from './shared/utils.js';

/* ─── Helper: find lesson by slug ───────────────────────── */
function findLessonBySlug(curriculum, slug) {
  for (const [sIdx, section] of curriculum.entries()) {
    const lIdx = section.lessons.findIndex(l => l.slug === slug);
    if (lIdx !== -1) {
      return { sIdx, lIdx, section, lesson: section.lessons[lIdx] };
    }
  }
  return null;
}

/* ─── CoursePage Class ──────────────────────────────────── */
class CoursePage {
  constructor() {
    this.sidebar        = document.getElementById('sidebar');
    this.contentBody    = document.querySelector('.content-body');
    this.courseTitle    = document.getElementById('course-title');
    this.lessonSubtitle = document.getElementById('lesson-subtitle');

    this.courseSlug   = this.extractCourseSlug();
    this.curriculum   = null;
    this.courseData   = null;
    this.current      = null;

    this.init();
  }

  async init() {
    try {
      const isSSR = !!window.__INITIAL_DATA__;
      if (isSSR) {
        // use server-injected data
        this.courseData = window.__INITIAL_DATA__.course;
        this.curriculum = window.__INITIAL_DATA__.curriculum;
        delete window.__INITIAL_DATA__;
      } else {
        // fallback to API
        await this.loadCurriculum();
      }

      this.setCourseTitle();

      // Attach event listeners to existing SSR elements
      this.attachSidebarEventListeners();
      this.updateSidebarCounts();
      this.initSuggestionModal();

      const m = location.pathname.match(/^\/course\/[^/]+\/([^/]+)/);
      if (m) {
        const found = findLessonBySlug(this.curriculum, m[1]);
        if (found) {
          // always do this, so the correct section opens in the sidebar
          this.activateLesson(found.sIdx, found.lIdx, false);
        }
        return;
      }

      // All content is SSR - just setup interactivity for existing elements
    } catch (error) {
      console.error('Failed to initialize course page:', error);
      this.showError('Failed to load course data. Please refresh the page.');
    }
  }

  /* ── Load curriculum from API ─────────────────────────── */
  async loadCurriculum() {
    const courseData = await api.getCourse(this.courseSlug);
    this.curriculum = courseData.curriculum || [];
    this.courseData = courseData;
  }

  /* ── Helpers ──────────────────────────────────────────── */
  extractCourseSlug() {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts[0] === 'course' && parts[1] ? parts[1] : 'unknown-course';
  }
  hasAccess() {
    return localStorage.getItem('user_email') !== null;
  }
  showEmailGate() {
    window.emailGate?.show();
  }
  setCourseTitle() {
    if (this.courseTitle) this.courseTitle.style.display = 'none';
  }

  /* ── No progress tracking needed ─────────────────────────── */

  /* ── Attach event listeners to existing SSR sidebar ────── */
  attachSidebarEventListeners() {
    if (!this.sidebar) return;

    // Attach event listeners to existing lesson elements from SSR
    const lessonElements = this.sidebar.querySelectorAll('.lesson');
    lessonElements.forEach(el => {
      const sIdx = parseInt(el.dataset.section);
      const lIdx = parseInt(el.dataset.lesson);
      
      const activate = () => this.activateLesson(sIdx, lIdx, true);
      
      el.addEventListener('click', activate);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  showEmptyCurriculum() {
    this.sidebar.innerHTML = `
      <div style="padding:1.5rem; text-align:center; color:var(--text-light);">
        <p>No curriculum available.</p>
      </div>`;
  }
  
  updateSidebarCounts() {
    const total = this.curriculum.reduce((sum, sec) => sum + sec.lessons.length, 0);
    const el = document.querySelector('.sidebar-subtitle');
    if (el) el.textContent = `${this.curriculum.length} sections • ${total} lessons`;
  }

  /* ── Activate a lesson ─────────────────────────────────── */
  async activateLesson(sIdx, lIdx, push = true) {
    console.log('DEBUG: activateLesson called with:', sIdx, lIdx, push);
    console.log('DEBUG: curriculum:', this.curriculum);
    console.log('DEBUG: courseSlug:', this.courseSlug);
    
    const section = this.curriculum[sIdx];
    const lesson  = section.lessons[lIdx];
    this.current  = { sIdx, lIdx };

    console.log('DEBUG: section:', section);
    console.log('DEBUG: lesson:', lesson);

    if (push) {
      const url = `/course/${this.courseSlug}/${lesson.slug}`;
      console.log('DEBUG: Navigating to:', url);
      // Do full page navigation instead of pushState for pure SSR
      window.location.href = url;
      return; // Exit early since we're navigating away
    }

    // Update sidebar UI
    document.querySelectorAll('.lesson').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-section="${sIdx}"][data-lesson="${lIdx}"]`)?.classList.add('active');
    document.querySelectorAll('.section')[sIdx].open = true;

    console.log('DEBUG: Updated sidebar UI');

    // Setup navigation for SSR content
    this.setupNavigationButtons();
    console.log('DEBUG: Setup navigation buttons');
  }

setupNavigationButtons() {
    // Attach event listeners to existing SSR navigation buttons with auth check
    this.contentBody.querySelector('.prev-lesson-btn')?.addEventListener('click', e => {
      e.preventDefault();
      
      // Check auth before navigation
      if (!this.hasAccess()) {
        this.showEmailGate();
        return;
      }
      
      const s = +e.currentTarget.dataset.s;
      const l = +e.currentTarget.dataset.l;
      this.activateLesson(s, l, true);
    });
    
    this.contentBody.querySelector('.next-lesson-btn')?.addEventListener('click', e => {
      e.preventDefault();
      
      // Check auth before navigation
      if (!this.hasAccess()) {
        this.showEmailGate();
        return;
      }
      
      const s = +e.currentTarget.dataset.s;
      const l = +e.currentTarget.dataset.l;
      this.activateLesson(s, l, true);
    });
  }

  
  showError(message) {
    if (this.contentBody) {
      this.contentBody.innerHTML = `
        <div class="error-message" style="text-align:center;padding:2rem;">
          <h2>Error</h2>
          <p>${message}</p>
          <button onclick="location.reload()" class="btn btn-primary">Try Again</button>
        </div>`;
    }
  }

  /* ── Suggestion modal ─────────────────────────────────── */
initSuggestionModal() {
    const modal     = document.getElementById('suggestion-modal');
    const btn       = document.getElementById('suggestion-btn');
    const closeBtn  = document.getElementById('suggestion-close');
    const cancelBtn = document.getElementById('suggestion-cancel');
    const form      = document.getElementById('suggestion-form');
    const submitBtn = document.getElementById('suggestion-submit');
    const response  = document.getElementById('suggestion-response');
    const textarea  = document.getElementById('suggestion-message');
    const counter   = document.getElementById('char-count');
    if (!modal || !btn) return;

    const updateCount = () => {
      const len = textarea.value.length;
      counter.textContent = `(${len}/1000)`;
      counter.style.color = len > 950 ? '#dc2626' : 'var(--text-light)';
    };

    btn.addEventListener('click', () => {
      // Check if user is authenticated first
      const email = localStorage.getItem('user_email');
      if (!email) {
        this.showEmailGate();
        return;
      }
      
      // User is authenticated - open modal and pre-fill email
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      // Pre-fill and readonly the email field
      const emailField = form.email;
      if (emailField) {
        emailField.value = email;
        emailField.readOnly = true;
        emailField.style.backgroundColor = '#f5f5f5';
        emailField.style.cursor = 'not-allowed';
      }
      
      updateCount();
    });

    textarea.addEventListener('input', updateCount);
    
    const close = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      form.reset();
      response.style.display = 'none';
      
      // Reset email field state
      const emailField = form.email;
      if (emailField) {
        emailField.readOnly = false;
        emailField.style.backgroundColor = '';
        emailField.style.cursor = '';
      }
      
      updateCount();
    };
    
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      
      // Use the stored email instead of form field
      const email = localStorage.getItem('user_email');
      const data = {
        name: form.name.value,
        email: email, // Use stored email
        message: form.message.value,
        course: this.courseData.title,
        subject: `Course Suggestion for ${this.courseData.title}`
      };
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      
      try {
        const { success } = await api.sendSuggestion(data);
        if (success) {
          response.innerHTML = '<div class="suggestion-message success">Thanks! I read every suggestion and will email you back.</div>';
          response.style.display = 'block';
          setTimeout(close, 2000);
        } else throw new Error('Send failed');
      } catch (err) {
        response.innerHTML = `<div class="suggestion-message error">Error: ${err.message}</div>`;
        response.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Suggestion';
      }
    });
  }

}

/* ── Support back/forward ───────────────────────────────── */
window.addEventListener('popstate', e => {
  const slug = e.state?.lessonSlug;
  if (slug && window.coursePage?.curriculum) {
    const found = findLessonBySlug(window.coursePage.curriculum, slug);
    if (found) window.coursePage.activateLesson(found.sIdx, found.lIdx, false);
  } else {
    location.assign(`/course/${window.coursePage.courseSlug}`);
  }
});

/* ── Boot ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DEBUG: Course.js DOM loaded');
  console.log('DEBUG: Sidebar element:', document.getElementById('sidebar'));
  console.log('DEBUG: All lesson elements:', document.querySelectorAll('.lesson'));
  
  window.coursePage = new CoursePage();
  
  // DEBUG: Test basic click detection
  document.addEventListener('click', (e) => {
    console.log('DEBUG: Click detected on:', e.target);
    const lesson = e.target.closest('.lesson');
    if (lesson) {
      console.log('DEBUG: Lesson clicked!', lesson.dataset);
      console.log('DEBUG: Has access:', window.coursePage?.hasAccess());
      
      // If user doesn't have access, show email gate
      if (!window.coursePage?.hasAccess()) {
        console.log('DEBUG: No access - showing email gate');
        e.preventDefault();
        window.coursePage.showEmailGate();
        return;
      }
      
      // User has access - activate lesson
      const sIdx = parseInt(lesson.dataset.section);
      const lIdx = parseInt(lesson.dataset.lesson);
      console.log('DEBUG: Activating lesson:', sIdx, lIdx);
      window.coursePage.activateLesson(sIdx, lIdx, true);
    }
  });
});

console.log('DEBUG: Course.js file loaded');