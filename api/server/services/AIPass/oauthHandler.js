const mongoose = require('mongoose');
const { setAuthTokens } = require('~/server/services/AuthService');
const { storeAIPassTokens } = require('./tokenService');
const { checkBan } = require('~/server/middleware');

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

/**
 * AIPass OAuth handler - stores tokens and sets LibreChat session
 */
async function aipassOauthHandler(req, res, next) {
  try {
    if (res.headersSent) return;

    await checkBan(req, res);
    if (req.banned) return;

    const user = req.user;
    if (!user) {
      return res.redirect(`${domains.client}/login?error=auth_failed`);
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

    await setAuthTokens(user._id, res);
    res.redirect(domains.client);
  } catch (error) {
    next(error);
  }
}

module.exports = { aipassOauthHandler };
