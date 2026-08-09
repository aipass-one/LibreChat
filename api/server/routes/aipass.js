const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { getValidAIPassAccessToken } = require('~/server/services/AIPass');

const router = express.Router();
const AIPASS_BASE_URL = (
  process.env.AIPASS_BASE_URL ||
  process.env.AIPASS_ISSUER ||
  'https://aipass.one'
).replace(/\/+$/, '');

function parseAmount(value, { required = false } = {}) {
  if (value == null && !required) {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
}

/**
 * Returns the signed-in user's authoritative AI Pass wallet balance.
 * The provider OAuth token stays server-side and is never exposed to the browser.
 */
router.get('/balance', requireJwtAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const accessToken = await getValidAIPassAccessToken(mongoose, req.user?.id);
    if (!accessToken) {
      return res.sendStatus(204);
    }

    const response = await fetch(`${AIPASS_BASE_URL}/api/v1/usage/me/summary`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.warn('[AIPass balance] Upstream request failed', { status: response.status });
      return res.status(502).json({ error: 'AI Pass balance is temporarily unavailable' });
    }

    const payload = await response.json();
    const summary = payload?.data ?? payload;
    const remainingBudget = parseAmount(summary?.remainingBudget, { required: true });
    const totalCost = parseAmount(summary?.totalCost);
    const maxBudget = parseAmount(summary?.maxBudget);

    if (remainingBudget === undefined || totalCost === undefined || maxBudget === undefined) {
      logger.warn('[AIPass balance] Upstream response did not contain valid amounts');
      return res.status(502).json({ error: 'AI Pass balance is temporarily unavailable' });
    }

    return res.status(200).json({
      remainingBudget,
      totalCost,
      maxBudget,
      currency: 'USD',
    });
  } catch (error) {
    logger.warn('[AIPass balance] Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(502).json({ error: 'AI Pass balance is temporarily unavailable' });
  }
});

module.exports = router;
