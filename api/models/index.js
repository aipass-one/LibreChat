const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const methods = createMethods(mongoose);
const { comparePassword } = require('./userMethods');
const {
  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,
} = require('./Message');
const { getConvoTitle, getConvo, saveConvo, deleteConvos } = require('./Conversation');
const { getPreset, getPresets, savePreset, deletePresets } = require('./Preset');
const { File } = require('~/db/models');

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
};

module.exports = {
  ...methods,
  seedDatabase,
  comparePassword,

  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,

  getConvoTitle,
  getConvo,
  saveConvo,
  deleteConvos,

  getPreset,
  getPresets,
  savePreset,
  deletePresets,

  getAIPassToken,

  Files: File,
};
