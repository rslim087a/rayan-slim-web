/**
 * User Profile Component
 * Handles user profile dropdown functionality across all pages
 */
export class UserProfile {
  constructor() {
    this.userProfile = document.getElementById('user-profile');
    this.profileAvatar = document.getElementById('profile-avatar');
    this.profileDropdown = document.getElementById('profile-dropdown');
    this.profileEmail = document.getElementById('profile-email');
    this.profileLogout = document.getElementById('profile-logout');
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateDisplay();
  }

  setupEventListeners() {
    // Toggle dropdown
    this.profileAvatar?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      this.closeDropdown();
    });

    // Handle logout
    this.profileLogout?.addEventListener('click', () => {
      this.logout();
    });
  }

  toggleDropdown() {
    const isVisible = this.profileDropdown.style.display !== 'none';
    this.profileDropdown.style.display = isVisible ? 'none' : 'block';
  }

  closeDropdown() {
    if (this.profileDropdown) {
      this.profileDropdown.style.display = 'none';
    }
  }

  logout() {
    localStorage.removeItem('user_email');
    this.updateDisplay();
    this.closeDropdown();
    
    // Redirect to homepage after logout
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    } else {
      // If already on homepage, reload to update UI
      window.location.reload();
    }
  }

  updateDisplay() {
    const email = localStorage.getItem('user_email');
    
    if (email && this.userProfile) {
      // Show profile with first letter of email
      const firstLetter = email.charAt(0).toUpperCase();
      if (this.profileAvatar) {
        this.profileAvatar.textContent = firstLetter;
      }
      if (this.profileEmail) {
        this.profileEmail.textContent = email;
      }
      this.userProfile.style.display = 'block';
    } else if (this.userProfile) {
      // Hide profile
      this.userProfile.style.display = 'none';
    }
  }

  hasAccess() {
    return localStorage.getItem('user_email') !== null;
  }

  getEmail() {
    return localStorage.getItem('user_email');
  }
}

// Auto-initialize if elements exist
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('user-profile')) {
    window.userProfile = new UserProfile();
  }
});