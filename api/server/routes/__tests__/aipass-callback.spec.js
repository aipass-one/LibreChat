const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const request = require('supertest');
const { Passport, Strategy } = require('passport');

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const stateStore = require('../../../strategies/aipassStateStore');

describe('AI Pass callback without express-session', () => {
  let app;

  beforeEach(() => {
    stateStore.states.clear();
    const passport = new Passport();
    class AIPassStrategy extends Strategy {
      constructor() {
        super();
        this.name = 'aipass';
      }

      authenticate(req) {
        stateStore.verify(req, req.query.state, (error, verifier, info) => {
          if (error) return this.error(error);
          if (!verifier) return this.fail(info, 403);
          return this.success({ id: 'test-user' });
        });
      }
    }
    passport.use(new AIPassStrategy());
    const next = (_req, _res, continuation) => continuation();
    const dependencies = {
      express,
      passport,
      'openid-client': { randomState: () => 'unused' },
      '@librechat/data-schemas': { logger: { warn: () => {} } },
      'librechat-data-provider': { ErrorTypes: { AUTH_FAILED: 'auth_failed' } },
      '@librechat/api': {
        createSetBalanceConfig: () => next,
        createOpenIDCallbackAuthenticator: () => next,
      },
      '~/server/middleware': { checkDomainAllowed: next, loginLimiter: next, logHeaders: next },
      '~/server/controllers/auth/oauth': {
        createOAuthHandler: () => (_req, res) => res.status(200).send('signed in'),
      },
      '~/models': {},
      '~/server/services/AIPass': { aipassOauthHandler: next },
      '~/server/services/Config': {},
    };
    const source = fs.readFileSync(path.join(__dirname, '../oauth.js'), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module,
      require: (name) => {
        if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
        return dependencies[name];
      },
      process: { env: { DOMAIN_CLIENT: 'https://chat.example.test' } },
    });
    app = express();
    app.use(passport.initialize());
    app.use('/oauth', module.exports);
  });

  function state() {
    return new Promise((resolve, reject) => {
      stateStore.store({}, 'pkce-verifier', null, {}, (error, handle) => {
        if (error) reject(error);
        else resolve(handle);
      });
    });
  }

  it('accepts a valid state once and redirects a replay instead of throwing 500', async () => {
    const handle = await state();
    await request(app).get('/oauth/aipass/callback').query({ state: handle }).expect(200);
    const response = await request(app).get('/oauth/aipass/callback').query({ state: handle });
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://chat.example.test/oauth/error');
  });

  it('redirects a callback missing state without creating an HTTP session', async () => {
    const response = await request(app).get('/oauth/aipass/callback');
    expect(response.status).toBe(302);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
