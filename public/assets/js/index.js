/**
 * Homepage JavaScript
 * Pure SSR approach - only handles interactivity on server-rendered content
 * • Server renders all filters and course cards
 * • JavaScript only handles filtering and navigation
 */

class HomePage {
  constructor() {
    this.filtersContainer = document.getElementById('filters');
    this.coursesGrid      = document.getElementById('courses-grid');
    this.courses          = []; // Will be loaded from SSR data
    this.init();
  }

  async init() {
    try {
      // Get course data from SSR (server injects this)
      if (window.__INITIAL_DATA__) {
        this.courses = window.__INITIAL_DATA__.courses;
        delete window.__INITIAL_DATA__;
      }

      // Attach event listeners to existing SSR elements
      this.attachFilterListeners();
      this.attachCourseCardListeners();
      
    } catch (error) {
      console.error('Failed to initialize homepage:', error);
    }
  }

  attachFilterListeners() {
    if (!this.filtersContainer) return;
    
    const filterChips = this.filtersContainer.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
      const categoryKey = chip.dataset.category;
      
      const activate = () => {
        // Remove active from all chips
        filterChips.forEach(c => c.classList.remove('active'));
        // Add active to clicked chip
        chip.classList.add('active');
        // Filter courses
        this.filterCourses(categoryKey);
      };

      chip.addEventListener('click', activate);
      chip.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  attachCourseCardListeners() {
    if (!this.coursesGrid) return;
    
    const courseCards = this.coursesGrid.querySelectorAll('.course-card');
    courseCards.forEach(card => {
      const courseSlug = card.dataset.slug || 
                        card.getAttribute('href')?.replace('/course/', '') || 
                        card.querySelector('a')?.getAttribute('href')?.replace('/course/', '');
      
      const navigate = (e) => {
        // Check if user has access
        if (window.userProfile?.hasAccess()) {
          // Let the anchor link work naturally
          return true;
        } else {
          // Prevent navigation and show login modal
          e.preventDefault();
          e.stopPropagation();
          window.emailGate?.show(courseSlug);
          return false;
        }
      };

      card.addEventListener('click', navigate);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          navigate(e);
        }
      });
    });
  }

  filterCourses(categoryKey) {
    if (!this.coursesGrid) return;
    
    const courseCards = this.coursesGrid.querySelectorAll('.course-card');
    
    courseCards.forEach(card => {
      // Get the actual category from CSS classes (skip 'course-card' class)
      let cardCategory = 'unknown';
      
      for (let className of card.classList) {
        if (className !== 'course-card') {
          cardCategory = className;
          break;
        }
      }
      
      // Show/hide based on category
      if (categoryKey === 'all' || cardCategory === categoryKey) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  new HomePage();
});