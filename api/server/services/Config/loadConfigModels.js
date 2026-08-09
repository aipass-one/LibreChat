const { createLoadConfigModels, fetchModels } = require('@librechat/api');
const { getAppConfig } = require('./app');
const db = require('~/models');

const loadConfigModels = createLoadConfigModels({
  getAppConfig,
  getUserKeyValues: db.getUserKeyValues,
  getAIPassToken: db.getAIPassToken,
  fetchModels,
});

module.exports = loadConfigModels;
