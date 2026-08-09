const { encryptV2, decryptV2 } = require('@librechat/data-schemas');

const AIPASS_BASE_URL = (
  process.env.AIPASS_BASE_URL ||
  process.env.AIPASS_ISSUER ||
  'https://aipass.one'
).replace(/\/+$/, '');
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry

/**
 * Store AIPass tokens for a user (encrypted)
 */
async function storeAIPassTokens(mongoose, userId, { accessToken, refreshToken, expiresIn }) {
  const User = mongoose.models.User;
  const encryptedAccessToken = await encryptV2(accessToken);
  const encryptedRefreshToken = await encryptV2(refreshToken);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        aipassTokens: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
        },
      },
    },
    { new: true, runValidators: true },
  ).lean();
}

/**
 * Get AIPass tokens for a user (decrypted)
 */
async function getAIPassTokens(mongoose, userId) {
  const User = mongoose.models.User;
  const user = await User.findById(userId).select('+aipassTokens').lean();

  if (!user?.aipassTokens) {
    return null;
  }

  try {
    return {
      accessToken: await decryptV2(user.aipassTokens.accessToken),
      refreshToken: await decryptV2(user.aipassTokens.refreshToken),
      expiresAt: user.aipassTokens.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Check if tokens need refresh (within buffer of expiry)
 */
function tokensNeedRefresh(expiresAt) {
  if (!expiresAt) return true;
  return Date.now() >= new Date(expiresAt).getTime() - TOKEN_REFRESH_BUFFER;
}

/**
 * Refresh AIPass tokens using refresh token
 */
async function refreshAIPassTokens(mongoose, userId, refreshToken) {
  const response = await fetch(`${AIPASS_BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantType: 'refresh_token',
      refreshToken: refreshToken,
      clientId: process.env.AIPASS_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`AIPass token refresh failed: ${response.status}`);
  }

  const tokenData = await response.json();

  await storeAIPassTokens(mongoose, userId, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || refreshToken,
    expiresIn: tokenData.expires_in || 3600,
  });

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
  };
}

/**
 * Get a valid AIPass access token for a user (auto-refreshes if needed)
 */
async function getValidAIPassAccessToken(mongoose, userId) {
  const tokens = await getAIPassTokens(mongoose, userId);
  if (!tokens) return null;

  if (tokensNeedRefresh(tokens.expiresAt)) {
    try {
      const newTokens = await refreshAIPassTokens(mongoose, userId, tokens.refreshToken);
      return newTokens.accessToken;
    } catch {
      // If refresh fails, try existing token if not expired
      if (new Date(tokens.expiresAt).getTime() > Date.now()) {
        return tokens.accessToken;
      }
      return null;
    }
  }

  return tokens.accessToken;
}

/**
 * Clear AIPass tokens for a user (on logout)
 */
async function clearAIPassTokens(mongoose, userId) {
  const User = mongoose.models.User;
  await User.findByIdAndUpdate(userId, { $unset: { aipassTokens: '' } });
}

module.exports = {
  storeAIPassTokens,
  getAIPassTokens,
  getValidAIPassAccessToken,
  refreshAIPassTokens,
  clearAIPassTokens,
  tokensNeedRefresh,
};
