/**
 * Generate JSON-LD structured data for a course
 * @param {Object} course - Course data object
 * @param {Array} curriculum - Course curriculum array
 * @returns {Object} JSON-LD structured data
 */
function generateCourseJsonLD(course, curriculum) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description || course.shortDescription || '',
    provider: {
      "@type": "Person", 
      name: "Rayan Slim",
      url: "https://rayanslim.com"
    },
    educationalLevel: course.level || "Beginner to Intermediate",
    courseMode: "Online",
    teaches: course.whatYoullLearn || [],
    numberOfCredits: curriculum.reduce((sum, sec) => sum + sec.lessons.length, 0),
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "Online",
      instructor: {
        "@type": "Person",
        name: "Rayan Slim"
      }
    }
  };
}

/**
 * Generate JSON-LD structured data for a lesson
 * @param {Object} lesson - Lesson data object
 * @param {Object} course - Course data object
 * @param {string} courseSlug - Course slug
 * @returns {Object} JSON-LD structured data
 */
function generateLessonJsonLD(lesson, course, courseSlug) {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: lesson.name,
    description: lesson.metaDescription || `Learn ${lesson.name}`,
    educationalLevel: "Beginner",
    learningResourceType: "Tutorial",
    teaches: lesson.name,
    isPartOf: {
      "@type": "Course",
      name: course.title,
      url: `https://rayanslim.com/course/${courseSlug}`
    },
    author: {
      "@type": "Person",
      name: "Rayan Slim"
    }
  };
}

/**
 * Generate SEO head block for course pages
 * @param {Object} course - Course data object
 * @param {Array} curriculum - Course curriculum array
 * @returns {string} HTML head block with meta tags and JSON-LD
 */
function generateCourseHeadBlock(course, curriculum) {
  const seoTitle = course.seoTitle || course.title;
  const metaDesc = course.metaDescription || course.description?.slice(0, 160) || '';
  const canonical = `https://rayanslim.com/course/${course.slug}`;
  const jsonLd = generateCourseJsonLD(course, curriculum);

  return `
    <title>${seoTitle}</title>
    <meta name="description" content="${metaDesc}">
    <link rel="canonical" href="${canonical}">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <script>
      window.__INITIAL_DATA__ = ${JSON.stringify({ course, curriculum })}
    </script>
  `;
}

/**
 * Generate SEO head block for lesson pages
 * @param {Object} lesson - Lesson data object
 * @param {Object} course - Course data object
 * @param {Object} section - Section data object
 * @param {Array} curriculum - Course curriculum array
 * @param {number} sectionIndex - Section index
 * @param {number} lessonIndex - Lesson index
 * @param {string} requestUrl - Original request URL for canonical
 * @returns {string} HTML head block with meta tags and JSON-LD
 */
function generateLessonHeadBlock(lesson, course, section, curriculum, sectionIndex, lessonIndex, requestUrl) {
  const title = lesson.seoTitle
    ? `${lesson.seoTitle} | ${course.title}`
    : `${lesson.name} | ${section.title} – ${course.title}`;

  const description = lesson.metaDescription
    || `Lesson "${lesson.name}" from the ${section.title} section.`;

  const canonical = `https://rayanslim.com${requestUrl}`;
  const jsonLd = generateLessonJsonLD(lesson, course, course.slug);

  return `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonical}">
    <!-- GitHub Markdown CSS -->
    <link href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown.min.css" rel="stylesheet">
    <!-- Highlight.js -->
    <link href="https://cdn.jsdelivr.net/npm/highlight.js@11.8.0/styles/github.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.8.0/lib/common/index.min.js"></script>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <script>
      window.__INITIAL_DATA__ = ${JSON.stringify({
        course,
        curriculum,
        section,
        lesson,
        sectionIndex,
        lessonIndex
      })}
    </script>
  `;
}

/**
 * Create readable category label from slug
 * @param {string} categorySlug - Category slug
 * @returns {string} Readable category label
 */
function createCategoryLabel(categorySlug) {
  if (categorySlug === 'all') return 'All Free Courses';
  
  // Convert slug to readable format
  return categorySlug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = {
  generateCourseJsonLD,
  generateLessonJsonLD,
  generateCourseHeadBlock,
  generateLessonHeadBlock,
  createCategoryLabel
};