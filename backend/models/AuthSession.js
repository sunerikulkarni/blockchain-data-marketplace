const mongoose = require('mongoose');

const AuthSessionSchema = new mongoose.Schema({
  tokenId: { type: String, required: true, unique: true },
  subjectId: { type: String, required: true },
  role: { type: String, enum: ['user', 'company', 'admin'], required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  walletChallenge: { type: String, default: null },
  walletChallengeExpiresAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('AuthSession', AuthSessionSchema);
