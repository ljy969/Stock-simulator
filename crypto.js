// 简易加密工具 - 用于本地存储加密
//
// SECURITY NOTE (read this before refactoring):
//   This module is a CLIENT-SIDE OBFUSCATION layer only. It does NOT provide
//   cryptographic security against a determined attacker because:
//     * the XOR key is hard-coded in the source and travels with the page
//     * all crypto operations run in the user's browser, where the user
//       already owns the key material
//   The encrypted localStorage value is only safe against casual snooping
//   (e.g. another user glancing at the same browser, or a screenshot
//   showing the localStorage dump). It is NOT a defense against DevTools
//   access, XSS, or a hostile browser extension.
//
//   Password hashing has been upgraded to PBKDF2-SHA-256 with a random
//   per-user salt and 100k iterations. Legacy single-pass 32-bit hashes
//   are still verified for backward-compatibility (so existing users
//   don't lose their accounts), and are transparently upgraded to the
//   new format on next successful login.
const Crypto = {
    // Hash algorithm version. Bump when changing the KDF.
    HASH_VERSION: 'pbkdf2-sha256-100k',
    PBKDF2_ITERATIONS: 100000,

    // 简单的异或加密
    // #16 Fix: build the code units first, then join them in chunks. The old loop
    // concatenated one character at a time, reallocating the whole prefix on every
    // iteration, so re-encrypting a multi-save database (megabytes) cost hundreds of
    // milliseconds per save. The output is byte-for-byte identical to the old one.
    xorEncrypt(text, key) {
        const len = text.length;
        if (len === 0) return '';
        const keyLen = key.length;
        const units = new Array(len);
        for (let i = 0; i < len; i++) {
            units[i] = text.charCodeAt(i) ^ key.charCodeAt(i % keyLen);
        }
        const CHUNK = 8192;
        let result = '';
        for (let i = 0; i < len; i += CHUNK) {
            result += String.fromCharCode.apply(null, units.slice(i, i + CHUNK));
        }
        return result;
    },

    // Base64编码
    toBase64(text) {
        try {
            return btoa(unescape(encodeURIComponent(text)));
        } catch (e) {
            return btoa(text);
        }
    },

    // Base64解码
    fromBase64(text) {
        try {
            return decodeURIComponent(escape(atob(text)));
        } catch (e) {
            return atob(text);
        }
    },

    // 加密 (XOR + Base64). Client-side obfuscation only. See SECURITY NOTE.
    encrypt(text, key = 'stock-simulator-2024') {
        const xorResult = this.xorEncrypt(text, key);
        return this.toBase64(xorResult);
    },

    // 解密
    decrypt(encryptedText, key = 'stock-simulator-2024') {
        try {
            const xorResult = this.fromBase64(encryptedText);
            return this.xorEncrypt(xorResult, key);
        } catch (e) {
            return null;
        }
    },

    // Legacy 32-bit Java-style hash used by old accounts. Kept for verification
    // only - new hashes should be produced by hash().
    _legacyHash(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    },

    // Detect whether a stored hash string uses the legacy single-pass format.
    isLegacyHash(stored) {
        return typeof stored === 'string' && /^[0-9a-f]{8}$/.test(stored);
    },

    // Async password hashing. Returns a Promise<string> in the form
    //   "pbkdf2-sha256-100k$<saltHex>$<derivedHex>"
    // Falls back to a synchronous legacy hash if Web Crypto is unavailable
    // (extremely old browsers, file:// in some contexts).
    async hashAsync(password, saltHex) {
        if (typeof crypto === 'undefined' || !crypto.subtle) {
            return this.HASH_VERSION + '$' + (saltHex || '0'.repeat(32)) + '$' + this._legacyHash(password);
        }
        const enc = new TextEncoder();
        const salt = saltHex
            ? new Uint8Array(saltHex.match(/.{1,2}/g).map(b => parseInt(b, 16)))
            : crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey(
            'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: this.PBKDF2_ITERATIONS, hash: 'SHA-256' },
            keyMaterial, 256
        );
        const derived = new Uint8Array(bits);
        const derivedHex = Array.from(derived).map(b => b.toString(16).padStart(2, '0')).join('');
        const saltOut = saltHex || Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
        return this.HASH_VERSION + '$' + saltOut + '$' + derivedHex;
    },

    // Synchronous wrapper kept for backward compatibility. Returns a hash
    // that may be either legacy or new-format; login() handles both.
    hash(text) {
        // Synchronous fallback: legacy hash. New callers should prefer hashAsync.
        return this._legacyHash(text);
    },

    // Verify a plaintext password against a stored hash string.
    // Returns a Promise<{ valid: boolean, upgradedHash?: string }>.
    // If the stored hash is legacy and the password matches, upgradedHash
    // contains the new-format hash so the caller can persist it.
    async verifyPassword(password, storedHash) {
        if (this.isLegacyHash(storedHash)) {
            const legacy = this._legacyHash(password);
            if (legacy === storedHash) {
                const upgraded = await this.hashAsync(password);
                return { valid: true, upgradedHash: upgraded };
            }
            return { valid: false };
        }
        if (typeof storedHash !== 'string' || !storedHash.startsWith(this.HASH_VERSION + '$')) {
            return { valid: false };
        }
        const parts = storedHash.split('$');
        if (parts.length !== 3) return { valid: false };
        const recomputed = await this.hashAsync(password, parts[1]);
        return { valid: recomputed === storedHash };
    },

    // 生成UUID
    uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
};
