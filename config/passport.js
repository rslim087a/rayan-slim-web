const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

function configurePassport() {
  // Serialization
  passport.serializeUser((u, done) => done(null, u));
  passport.deserializeUser((u, done) => done(null, u));

  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback'
    },
    (_, __, profile, done) => done(null, { email: profile.emails[0].value })
  ));

  // GitHub OAuth Strategy - Development
  passport.use('github-dev', new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID_DEV,
      clientSecret: process.env.GITHUB_CLIENT_SECRET_DEV,
      callbackURL: '/auth/github/callback',
      scope: ['user:email']
    },
    (_, __, profile, done) => {
      const email = (profile.emails.find(e => e.primary) || profile.emails[0]).value;
      done(null, { email });
    }
  ));

  // GitHub OAuth Strategy - Production
  passport.use('github-prod', new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID_PROD,
      clientSecret: process.env.GITHUB_CLIENT_SECRET_PROD,
      callbackURL: '/auth/github/callback',
      scope: ['user:email']
    },
    (_, __, profile, done) => {
      const email = (profile.emails.find(e => e.primary) || profile.emails[0]).value;
      done(null, { email });
    }
  ));
}

// Helper function to pick GitHub strategy based on host
function pickGitHubStrategy(host) {
  return host.startsWith('localhost') || host.startsWith('127.')
    ? 'github-dev'
    : 'github-prod';
}

module.exports = {
  configurePassport,
  pickGitHubStrategy
};