const passport = require('passport');
const { Strategy: OAuth2Strategy } = require('passport-oauth2');
const { hashToken } = require('@librechat/data-schemas');
const { getBalanceConfig, isEmailDomainAllowed } = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { findUser, createUser, updateUser } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const stateStore = require('./aipassStateStore');

const AIPASS_BASE_URL = process.env.AIPASS_ISSUER || 'https://aipass.one';

const aipassConfig = {
  authorizationURL: `${AIPASS_BASE_URL}/oauth2/authorize`,
  tokenURL: `${AIPASS_BASE_URL}/oauth2/token`,
  userInfoURL: `${AIPASS_BASE_URL}/oauth2/userinfo`,
};

async function exchangeCodeForTokens(code, codeVerifier, redirectUri) {
  const response = await fetch(aipassConfig.tokenURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantType: 'authorization_code',
      code,
      clientId: process.env.AIPASS_CLIENT_ID,
      redirectUri,
      codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

async function fetchUserInfo(accessToken) {
  const response = await fetch(aipassConfig.userInfoURL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  return response.json();
}

async function downloadAvatar(url, accessToken) {
  if (!url) return '';

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
    return '';
  } catch {
    return '';
  }
}

async function setupAIPass() {
  const callbackURL = `${process.env.DOMAIN_SERVER}${process.env.AIPASS_CALLBACK_URL}`;

  const strategy = new OAuth2Strategy(
    {
      authorizationURL: aipassConfig.authorizationURL,
      tokenURL: aipassConfig.tokenURL,
      clientID: process.env.AIPASS_CLIENT_ID,
      clientSecret: process.env.AIPASS_CLIENT_SECRET || 'unused',
      callbackURL,
      scope: ['profile:read', 'api:access'],
      pkce: true,
      state: true,
      store: stateStore,
    },
    async (accessToken, refreshToken, params, profile, done) => {
      try {
        const userinfo = await fetchUserInfo(accessToken);
        const appConfig = await getAppConfig();
        const email = userinfo.email;

        if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
          return done(null, false, { message: 'Email domain not allowed' });
        }

        let user = await findUser({ aipassId: userinfo.sub });
        if (!user) {
          user = await findUser({ email: email?.trim()?.toLowerCase() });
        }

        const fullName =
          userinfo.name ||
          userinfo.full_name ||
          (userinfo.given_name && userinfo.family_name
            ? `${userinfo.given_name} ${userinfo.family_name}`
            : userinfo.given_name || userinfo.family_name || userinfo.username || email);

        const username = userinfo.preferred_username || userinfo.username || email?.split('@')[0] || 'user';

        if (!user) {
          const balanceConfig = getBalanceConfig(appConfig);
          user = await createUser(
            {
              provider: 'aipass',
              aipassId: userinfo.sub,
              email: email || '',
              emailVerified: userinfo.email_verified || false,
              username,
              name: fullName,
            },
            balanceConfig,
            true,
            true,
          );
        } else {
          user.provider = 'aipass';
          user.aipassId = userinfo.sub;
          user.username = username;
          user.name = fullName;

          if (email && email !== user.email) {
            user.email = email;
            user.emailVerified = userinfo.email_verified || false;
          }
        }

        if (userinfo.picture && !user.avatar?.includes('manual=true')) {
          const imageBuffer = await downloadAvatar(userinfo.picture, accessToken);
          if (imageBuffer) {
            try {
              const fileName = (await hashToken(userinfo.sub)) + '.png';
              const { saveBuffer } = getStrategyFunctions(appConfig?.fileStrategy ?? process.env.CDN_PROVIDER);
              const imagePath = await saveBuffer({ fileName, userId: user._id.toString(), buffer: imageBuffer });
              user.avatar = imagePath ?? '';
            } catch {
              // Avatar save failed, continue without it
            }
          }
        }

        user = await updateUser(user._id, user);

        done(null, {
          ...user,
          federatedTokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: params.expires_in || 3600,
          },
        });
      } catch (error) {
        done(error);
      }
    },
  );

  strategy.userProfile = function (accessToken, done) {
    done(null, {});
  };

  const originalGetOAuthAccessToken = strategy._oauth2.getOAuthAccessToken.bind(strategy._oauth2);
  strategy._oauth2.getOAuthAccessToken = function (code, params, callback) {
    if (params.code_verifier) {
      exchangeCodeForTokens(code, params.code_verifier, params.redirect_uri || callbackURL)
        .then((tokenData) => {
          callback(null, tokenData.access_token || tokenData.accessToken, tokenData.refresh_token || tokenData.refreshToken, tokenData);
        })
        .catch(callback);
    } else {
      originalGetOAuthAccessToken(code, params, callback);
    }
  };

  passport.use('aipass', strategy);
}

module.exports = { setupAIPass };
