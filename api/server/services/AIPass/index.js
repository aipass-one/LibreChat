const {
  storeAIPassTokens,
  getAIPassTokens,
  getValidAIPassAccessToken,
  refreshAIPassTokens,
  clearAIPassTokens,
  tokensNeedRefresh,
} = require('./tokenService');

const { aipassOauthHandler } = require('./oauthHandler');

module.exports = {
  // Token management
  storeAIPassTokens,
  getAIPassTokens,
  getValidAIPassAccessToken,
  refreshAIPassTokens,
  clearAIPassTokens,
  tokensNeedRefresh,

  // OAuth handler
  aipassOauthHandler,
};
