const express = require('express');
const passport = require('passport');
const router = express.Router();
const { getCollections } = require('../../config/database');
const { pickGitHubStrategy } = require('../../config/passport');

// OAuth callback handler
function oauthCallback(req, res) {
  const email = req.user?.email;
  if (!email) return res.send('<h2>No email returned</h2>');
  
  const { emailsCol } = getCollections();
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

// ── OAuth initiation routes ──────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['email','profile'] }));

router.get('/github', (req, res, next) =>
  passport.authenticate(pickGitHubStrategy(req.headers.host), { scope: ['user:email'] })(req, res, next)
);

// ── OAuth callback routes ────────────────────────────────
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  oauthCallback
);

router.get('/github/callback',
  (req, res, next) => passport.authenticate(pickGitHubStrategy(req.headers.host), { failureRedirect: '/' })(req, res, next),
  oauthCallback
);

module.exports = router;