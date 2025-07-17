/**
 * About Page JavaScript
 * Minimal JavaScript for about page functionality
 */

class AboutPage {
  constructor() {
    this.init();
  }

  init() {
    // Add any about page specific functionality here
    this.animateStats();
    this.setupAccessibility();
  }

  animateStats() {
    // Animate stats when they come into view
    const stats = document.querySelectorAll('.stat');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.animation = 'fadeInUp 0.6s ease-out';
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1
    });

    stats.forEach(stat => {
      observer.observe(stat);
    });
  }

  setupAccessibility() {
    // Add keyboard navigation for stats
    const stats = document.querySelectorAll('.stat');
    
    stats.forEach((stat, index) => {
      stat.setAttribute('tabindex', '0');
      stat.setAttribute('role', 'button');
      stat.setAttribute('aria-label', `Statistic ${index + 1}`);
      
      stat.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Could add functionality like showing more details
          stat.style.transform = 'scale(1.05)';
          setTimeout(() => {
            stat.style.transform = '';
          }, 150);
        }
      });
    });
  }
}

// Initialize about page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new AboutPage();
});