const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const { matchModelName, findMatchingPattern } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const methods = createMethods(mongoose, {
  matchModelName,
  findMatchingPattern,
  getCache: getLogStores,
});

/**
 * Get valid AIPass access token for a user (with auto-refresh)
 * Uses lazy loading to avoid circular dependency
 * @param {Object} params
 * @param {string} params.userId - The user ID
 * @returns {Promise<string | null>} - The valid access token or null if not available
 */
async function getAIPassToken({ userId }) {
  // Lazy load to avoid circular dependency:
  // models -> AIPass service -> oauthHandler -> AuthService -> models
  const { getValidAIPassAccessToken } = require('~/server/services/AIPass');
  return getValidAIPassAccessToken(mongoose, userId);
}

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
  await methods.seedSystemGrants();
};

module.exports = {
  ...methods,
  seedDatabase,
  getAIPassToken,
};
