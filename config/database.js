const { MongoClient } = require('mongodb');

// Get MONGODB_URI from environment (will be set after dotenv.config() is called)
function getMongoDB_URI() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set. Please check your .env file.');
  }
  return uri;
}

// Collection handles - will be set after connection
let emailsCol, suggestionsCol, coursesCol;
let sectionsCol, lessonsCol, categoryOrderCol;

async function connectDatabase() {
  try {
    const MONGODB_URI = getMongoDB_URI(); // Get URI after dotenv is loaded
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('zeroDevops');

    // Initialize collection handles
    emailsCol = db.collection('course_access');
    suggestionsCol = db.collection('course_suggestions');
    coursesCol = db.collection('courses');
    sectionsCol = db.collection('sections');
    lessonsCol = db.collection('lessons');
    categoryOrderCol = db.collection('category_order');

    // Create indexes
    await createIndexes();
    
    console.log('✅  Mongo connected and indexes created');
    
    return { client, db };
  } catch (err) {
    console.error('Mongo error:', err);
    throw err;
  }
}

async function createIndexes() {
  await emailsCol.createIndex({ email: 1, slug: 1 }, { unique: true });
  await coursesCol.createIndex({ slug: 1 }, { unique: true });
  await sectionsCol.createIndex({ courseSlug: 1, index: 1 });
  await lessonsCol.createIndex({ courseSlug: 1, sectionIndex: 1 });
  await lessonsCol.createIndex({ slug: 1, courseSlug: 1 }, { unique: true });
  await categoryOrderCol.createIndex({ id: 1 }, { unique: true });
}

// Export collection getters
function getCollections() {
  return {
    emailsCol,
    suggestionsCol,
    coursesCol,
    sectionsCol,
    lessonsCol,
    categoryOrderCol
  };
}

module.exports = {
  connectDatabase,
  getCollections
};