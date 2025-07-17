/**
 * Generate a consistent color for a category name using a hash function
 * @param {string} categoryName - The category name to generate color for
 * @returns {string} Hex color code
 */
function generateCategoryColor(categoryName) {
  // Simple hash function to generate consistent color from string
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    const char = categoryName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Professional color palette - predefined nice colors
  const professionalColors = [
    '#667eea', // Purple-blue
    '#f093fb', // Pink-purple  
    '#4facfe', // Light blue
    '#43e97b', // Green
    '#fa709a', // Pink-orange
    '#a8edea', // Mint
    '#ff9a9e', // Coral
    '#a18cd1', // Lavender
    '#ffecd2', // Peach
    '#ff8a80', // Salmon
    '#326ce5', // Blue (Kubernetes-like)
    '#2563eb', // Professional blue
    '#7c3aed', // Purple
    '#dc2626', // Red
    '#059669', // Emerald
    '#d97706', // Orange
    '#be185d', // Rose
    '#0891b2', // Cyan
  ];
  
  // Use hash to pick from professional palette
  const colorIndex = Math.abs(hash) % professionalColors.length;
  return professionalColors[colorIndex];
}

module.exports = {
  generateCategoryColor
};