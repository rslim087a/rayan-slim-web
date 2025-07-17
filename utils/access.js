const { getCollections } = require('../config/database');

/**
 * Check if a user has access to courses
 * @param {string} email - User email to check
 * @returns {Promise<boolean>} Whether user has access
 */
async function checkUserAccess(email) {
  if (!email) return false;
  
  const { emailsCol } = getCollections();
  const doc = await emailsCol.findOne({ email, slug: 'universal' });
  return !!doc;
}

module.exports = {
  checkUserAccess
};