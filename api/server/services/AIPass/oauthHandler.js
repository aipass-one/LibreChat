const mongoose = require('mongoose');
const { storeAIPassTokens } = require('./tokenService');

/**
 * Persist AIPass provider tokens before LibreChat creates its own session.
 * Session creation and redirects remain in LibreChat's shared OAuth handler.
 */
async function aipassOauthHandler(req, res, next) {
  try {
    if (res.headersSent) return;

    const user = req.user;
    if (!user) {
      return next(new Error('AIPass authentication completed without a user.'));
    }

    // Store AIPass tokens (encrypted) for later API use
    if (user.federatedTokens) {
      try {
        await storeAIPassTokens(mongoose, user._id.toString(), {
          accessToken: user.federatedTokens.access_token,
          refreshToken: user.federatedTokens.refresh_token,
          expiresIn: user.federatedTokens.expires_in || 3600,
        });
      } catch {
        // Continue with login even if token storage fails
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { aipassOauthHandler };
