const { marked } = require('marked');

function configureMarked() {
  marked.setOptions({
    gfm: true,                    // GitHub Flavored Markdown
    breaks: false,                // Don't convert \n to <br>
    headerIds: true,              // Add IDs to headers
    mangle: false,                // Don't mangle autolinked email addresses
    sanitize: false,              // Don't sanitize HTML
    smartLists: true,             // Use smarter list behavior
    smartypants: false,           // Don't use smart quotes
    xhtml: false                  // Don't output XHTML
  });
}

module.exports = {
  configureMarked,
  marked
};