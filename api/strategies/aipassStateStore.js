const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');

/**
 * Generate a random handle (similar to uid2)
 * @param {number} length - Length of the handle
 * @returns {string}
 */
function generateHandle(length = 24) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Custom state store for AIPass OAuth2 with PKCE support
 * Implements the passport-oauth2 StateStore interface without requiring express-session
 *
 * passport-oauth2 checks function arity to determine calling convention:
 * - store with 5 params: (req, verifier, state, meta, callback) - PKCE mode
 * - verify with 3 params: (req, state, callback) - returns (err, verifier, originalState)
 */
class AIPassStateStore {
  constructor() {
    this.states = new Map();
    // Clean up expired states every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Store request state with PKCE support
   *
   * @param {Object} req - Express request
   * @param {string} verifier - PKCE code_verifier
   * @param {*} state - Original state data (usually undefined)
   * @param {Object} meta - Metadata
   * @param {Function} callback - Callback(err, handle)
   */
  store(req, verifier, state, meta, callback) {
    try {
      // Generate a unique handle - this is what gets sent as the 'state' parameter
      const handle = generateHandle(24);

      const stateData = {
        handle,
        verifier, // PKCE code_verifier
        state,    // Original state (usually undefined)
        meta,
        createdAt: Date.now(),
        // 10 minute TTL for OAuth flow
        expiresAt: Date.now() + 10 * 60 * 1000,
      };

      this.states.set(handle, stateData);
      logger.info(`[AIPass StateStore] Stored state: ${handle.substring(0, 8)}... (${this.states.size} total)`);

      // Return the handle - this becomes the 'state' parameter in the OAuth URL
      callback(null, handle);
    } catch (error) {
      logger.error('[AIPass StateStore] Error storing state:', error);
      callback(error);
    }
  }

  /**
   * Verify request state and return PKCE verifier
   *
   * @param {Object} req - Express request
   * @param {string} providedState - The handle from the callback
   * @param {Function} callback - Callback(err, verifier, originalState)
   */
  verify(req, providedState, callback) {
    try {
      if (!providedState) {
        logger.error('[AIPass StateStore] No state provided');
        return callback(null, false, { message: 'No state provided' });
      }

      logger.info(`[AIPass StateStore] Verifying state: ${providedState.substring(0, 8)}... (${this.states.size} in store)`);

      const stateData = this.states.get(providedState);

      if (!stateData) {
        logger.error(`[AIPass StateStore] State not found. Available keys: ${Array.from(this.states.keys()).map(k => k.substring(0, 8)).join(', ')}`);
        return callback(null, false, { message: 'Unable to verify authorization request state.' });
      }

      if (Date.now() > stateData.expiresAt) {
        logger.error('[AIPass StateStore] State expired');
        this.states.delete(providedState);
        return callback(null, false, { message: 'State expired' });
      }

      // State is valid - remove it (one-time use)
      this.states.delete(providedState);
      logger.info('[AIPass StateStore] State verified successfully');

      // For PKCE: return (err, code_verifier, original_state)
      // passport-oauth2 checks if second arg is string to determine PKCE mode
      callback(null, stateData.verifier, stateData.state);
    } catch (error) {
      logger.error('[AIPass StateStore] Error verifying state:', error);
      callback(error);
    }
  }

  /**
   * Clean up expired states
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [handle, data] of this.states.entries()) {
      if (now > data.expiresAt) {
        this.states.delete(handle);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`[AIPass StateStore] Cleaned up ${cleaned} expired states`);
    }
  }

  /**
   * Destroy the store and clear interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.states.clear();
  }
}

// Singleton instance
const stateStore = new AIPassStateStore();

module.exports = stateStore;
