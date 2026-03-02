/**
 * 暗号化ユーティリティのユニットテスト
 */

const { encrypt, decrypt, shouldEncrypt } = require('../../src/utils/encryption');

describe('Encryption Utils', () => {
  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'This is a secret message';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should return different ciphertext for same plaintext', () => {
      const plaintext = 'Same message';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // 同じ平文でも異なる暗号文になる（IVが異なるため）
      expect(encrypted1).not.toBe(encrypted2);

      // ただし、復号化すると同じ平文になる
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      expect(encrypted).toBe('');
    });

    it('should handle null', () => {
      const encrypted = encrypt(null);
      expect(encrypted).toBe('');
    });

    it('should handle undefined', () => {
      const encrypted = encrypt(undefined);
      expect(encrypted).toBe('');
    });

    it('should encrypt Japanese text correctly', () => {
      const plaintext = 'これは日本語のテストです';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(plaintext);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long text', () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when decrypting invalid data', () => {
      expect(() => decrypt('invalid-encrypted-data')).toThrow();
    });
  });

  describe('shouldEncrypt', () => {
    it('should return true for groq_api_key', () => {
      expect(shouldEncrypt('groq_api_key')).toBe(true);
    });

    it('should return true for proxy_password', () => {
      expect(shouldEncrypt('proxy_password')).toBe(true);
    });

    it('should return true for api_key', () => {
      expect(shouldEncrypt('api_key')).toBe(true);
    });

    it('should return true for keys ending with _secret', () => {
      expect(shouldEncrypt('jwt_secret')).toBe(true);
      expect(shouldEncrypt('encryption_secret')).toBe(true);
    });

    it('should return true for keys ending with _password', () => {
      expect(shouldEncrypt('db_password')).toBe(true);
      expect(shouldEncrypt('user_password')).toBe(true);
    });

    it('should return true for keys ending with _token', () => {
      expect(shouldEncrypt('access_token')).toBe(true);
      expect(shouldEncrypt('refresh_token')).toBe(true);
    });

    it('should return true for keys ending with _key', () => {
      expect(shouldEncrypt('private_key')).toBe(true);
      expect(shouldEncrypt('public_key')).toBe(true);
    });

    it('should return false for ai_max_tokens', () => {
      expect(shouldEncrypt('ai_max_tokens')).toBe(false);
    });

    it('should return false for normal keys', () => {
      expect(shouldEncrypt('project_name')).toBe(false);
      expect(shouldEncrypt('task_description')).toBe(false);
      expect(shouldEncrypt('user_name')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(shouldEncrypt('GROQ_API_KEY')).toBe(true);
      expect(shouldEncrypt('Proxy_Password')).toBe(true);
    });
  });
});
