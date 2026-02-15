/**
 * 認証ミドルウェアのユニットテスト
 */

const { generateToken } = require('../../src/middleware/auth');
const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');

describe('Auth Middleware', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload = {
        userId: 1,
        username: 'testuser',
        role: 'member'
      };

      const token = generateToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should create a token that can be verified', () => {
      const payload = {
        userId: 1,
        username: 'testuser',
        role: 'member'
      };

      const token = generateToken(payload);
      const decoded = jwt.verify(token, config.jwt.secret);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.role).toBe(payload.role);
    });

    it('should include expiration time', () => {
      const payload = {
        userId: 1,
        username: 'testuser'
      };

      const token = generateToken(payload);
      const decoded = jwt.verify(token, config.jwt.secret);

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should throw error for invalid token structure', () => {
      expect(() => {
        generateToken(null);
      }).toThrow();
    });
  });
});
