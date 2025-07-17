/**
 * Email / OAuth Gate – OAuth-only version
 */

export class EmailGate {
  constructor() {
    this.root   = document.getElementById('email-gate');
    this.close  = document.getElementById('email-gate-close');

    /* OAuth buttons */
    this.btnGoogle    = document.getElementById('oauth-google');
    this.btnMicrosoft = document.getElementById('oauth-microsoft');
    this.btnGithub    = document.getElementById('oauth-github');

    this.pendingSlug = null;
    this.init();
  }

  init() {
    if (!this.root) return;

    /* close */
    this.close?.addEventListener('click', () => this.hide());
    this.root.addEventListener('click', e => { if (e.target === this.root) this.hide(); });

    /* pop-ups */
    this.btnGoogle?.addEventListener('click',    () => this.openPopup('/auth/google'));
    this.btnMicrosoft?.addEventListener('click', () => this.openPopup('/auth/microsoft'));
    this.btnGithub?.addEventListener('click',    () => this.openPopup('/auth/github'));

    /* listen for success */
    window.addEventListener('message', e => {
      if (e.data?.type === 'oauth-success' && e.data.email) {
       if (e.source && typeof e.source.close === 'function') {
         try { e.source.close(); } catch (_) {}
       }
        this.finish(e.data.email);
      }
});
  }

  /* external API */
  show(slug = null) {
    this.pendingSlug = slug;
    this.root.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  hide() {
    this.root.style.display = 'none';
    document.body.style.overflow = '';
    this.pendingSlug = null;
  }

  /* helpers */
  openPopup(url) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    window.open(`${url}?redirect=${redirect}`, 'oauth',
      'popup,width=500,height=600');
  }
  finish(email) {
    localStorage.setItem('user_email', email);
    window.userProfile?.updateDisplay();
    this.hide();
    if (this.pendingSlug) location.href = `/course/${this.pendingSlug}`;
  }
}

/* auto-init */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('email-gate')) {
    window.emailGate = new EmailGate();
  }
});
