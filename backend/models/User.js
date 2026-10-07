const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  walletAddress: { type: String, trim: true, lowercase: true, default: undefined }
}, { timestamps: true });

UserSchema.index({ walletAddress: 1 }, {
  unique: true,
  partialFilterExpression: { walletAddress: { $type: 'string' } }
});

module.exports = mongoose.model('User', UserSchema);
