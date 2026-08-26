const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

/*
 * Get encryption key from .env
 *
 * The key must be exactly 32 bytes.
 */
function getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;

    if (!key) {
        throw new Error("ENCRYPTION_KEY is missing in .env");
    }

    return Buffer.from(key, "hex");
}

/*
 * Encrypt data using AES-256-GCM
 */
function encryptData(data) {
    const key = getEncryptionKey();

    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(
        ALGORITHM,
        key,
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(data, "utf8"),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return {
        encryptedData: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64")
    };
}

/*
 * Decrypt encrypted data
 */
function decryptData(encryptedData, iv, authTag) {
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, "base64")
    );

    decipher.setAuthTag(
        Buffer.from(authTag, "base64")
    );

    const decrypted = Buffer.concat([
        decipher.update(
            Buffer.from(encryptedData, "base64")
        ),
        decipher.final()
    ]);

    return decrypted.toString("utf8");
}

/*
 * Generate SHA-256 hash
 */
function generateHash(data) {
    return crypto
        .createHash("sha256")
        .update(data, "utf8")
        .digest("hex");
}

module.exports = {
    encryptData,
    decryptData,
    generateHash
};