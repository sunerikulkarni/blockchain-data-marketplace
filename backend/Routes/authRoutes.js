const crypto = require('crypto');
const express = require('express');
const { ethers } = require('ethers');
const User = require('../models/User');
const Company = require('../models/Company');
const AuthSession = require('../models/AuthSession');
const requireAuth = require('../middleware/authMiddleware');
const { hashPassword, verifyPassword, createSession } = require('../services/authService');

const router = express.Router();
const PASSWORD_MIN_LENGTH = 10;

function validPassword(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH && password.length <= 128;
}

function publicUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    walletAddress: user.walletAddress || null,
    notificationsEnabled: user.notificationsEnabled !== false
  };
}

function publicCompany(company) {
  return {
    id: company._id,
    companyName: company.companyName,
    email: company.email,
    registrationNumber: company.registrationNumber,
    walletAddress: company.walletAddress,
    description: company.description,
    verificationStatus: company.verificationStatus,
    rejectionReason: company.rejectionReason || null
  };
}

function sameString(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendLogin(res, role, subjectId, account) {
  return createSession(role, subjectId).then(({ token, expiresIn }) => res.json({
    success: true,
    token,
    expiresIn,
    role,
    data: account
  }));
}

router.post('/auth/register/user', async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const walletAddress = String(req.body.walletAddress || '').trim();
  const password = req.body.password;
  if (!fullName || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !ethers.isAddress(walletAddress) || !validPassword(password)) {
    return res.status(400).json({ success: false, message: `Name, valid email, valid Ethereum wallet address, and a password of ${PASSWORD_MIN_LENGTH}–128 characters are required` });
  }
  try {
    const user = await User.create({ fullName, email, walletAddress: walletAddress.toLowerCase(), passwordHash: await hashPassword(password) });
    return res.status(201).json({ success: true, message: 'User account created. Please log in.', data: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.walletAddress || error.keyValue?.walletAddress) {
        return res.status(409).json({ success: false, message: 'This wallet is already linked to another user account' });
      }
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    console.error('User registration failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not create account' });
  }
});

router.post('/auth/login/user', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  try {
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Email or password is incorrect' });
    }
    return await sendLogin(res, 'user', user._id, publicUser(user));
  } catch (error) {
    console.error('User login failed:', error.message);
    return res.status(503).json({ success: false, message: 'Login service is unavailable' });
  }
});

router.post('/auth/login/company', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  try {
    const company = await Company.findOne({ email }).select('+passwordHash');
    if (!company || !company.passwordHash || !(await verifyPassword(password, company.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Email or password is incorrect' });
    }
    if (company.verificationStatus === 'pending') {
      return res.status(403).json({ success: false, code: 'COMPANY_PENDING', message: 'Company verification is pending' });
    }
    if (company.verificationStatus === 'rejected') {
      return res.status(403).json({ success: false, code: 'COMPANY_REJECTED', message: company.rejectionReason || 'Company verification was rejected' });
    }
    return await sendLogin(res, 'company', company._id, publicCompany(company));
  } catch (error) {
    console.error('Company login failed:', error.message);
    return res.status(503).json({ success: false, message: 'Login service is unavailable' });
  }
});

router.post('/auth/login/admin', async (req, res) => {
  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!username || !passwordHash) {
    return res.status(503).json({ success: false, message: 'Admin login is not configured on the server' });
  }
  try {
    if (!sameString(String(req.body.username || '').trim(), username) || !(await verifyPassword(req.body.password, passwordHash))) {
      return res.status(401).json({ success: false, message: 'Username or password is incorrect' });
    }
    return await sendLogin(res, 'admin', username, { username });
  } catch (error) {
    console.error('Admin login failed:', error.message);
    return res.status(503).json({ success: false, message: 'Login service is unavailable' });
  }
});

router.get('/auth/me', requireAuth(), (req, res) => {
  const data = req.auth.role === 'user' ? publicUser(req.user)
    : req.auth.role === 'company' ? publicCompany(req.company)
      : { username: process.env.ADMIN_USERNAME };
  res.json({ success: true, role: req.auth.role, data });
});

router.post('/auth/logout', requireAuth(), async (req, res) => {
  await AuthSession.deleteOne({ tokenId: req.auth.sessionId });
  res.json({ success: true, message: 'Signed out' });
});

router.put('/auth/profile', requireAuth('user'), async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  if (!fullName || fullName.length > 120) {
    return res.status(400).json({ success: false, message: 'Enter a name between 1 and 120 characters' });
  }
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { $set: { fullName } }, {
      new: true,
      runValidators: true,
      projection: 'fullName email walletAddress'
    });
    if (!user) return res.status(404).json({ success: false, message: 'User account was not found' });
    res.json({ success: true, data: publicUser(user) });
  } catch (error) {
    console.error('User profile update failed:', error.message);
    res.status(503).json({ success: false, message: 'Profile update service is unavailable' });
  }
});

router.post('/auth/password/change', requireAuth('user'), async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ success: false, message: 'Enter your current password' });
  }
  if (!validPassword(newPassword)) {
    return res.status(400).json({ success: false, message: `New password must be ${PASSWORD_MIN_LENGTH}–128 characters` });
  }
  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    const nextPasswordHash = await hashPassword(newPassword);
    await AuthSession.deleteMany({ subjectId: String(user._id), role: 'user' });
    user.passwordHash = nextPasswordHash;
    await user.save();
    res.json({ success: true, message: 'Password changed. Please sign in again.' });
  } catch (error) {
    console.error('User password change failed:', error.message);
    res.status(503).json({ success: false, message: 'Password change service is unavailable' });
  }
});

router.post('/auth/wallet/challenge', requireAuth('user'), async (req, res) => {
  const nonce = crypto.randomBytes(24).toString('hex');
  const message = `DataChain wallet verification\nNonce: ${nonce}`;
  req.auth.session.walletChallenge = message;
  req.auth.session.walletChallengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await req.auth.session.save();
  res.json({ success: true, message });
});

router.post('/auth/wallet/verify', requireAuth('user'), async (req, res) => {
  const { walletAddress, signature } = req.body;
  const session = req.auth.session;
  if (!session.walletChallenge || !session.walletChallengeExpiresAt || session.walletChallengeExpiresAt <= new Date()) {
    return res.status(400).json({ success: false, message: 'Request a new wallet verification challenge' });
  }
  if (!ethers.isAddress(walletAddress || '') || typeof signature !== 'string') {
    return res.status(400).json({ success: false, message: 'A valid wallet address and signature are required' });
  }
  try {
    const signer = ethers.verifyMessage(session.walletChallenge, signature);
    if (signer.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Wallet signature does not match the requested address' });
    }
    if (req.user.walletAddress && req.user.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(409).json({ success: false, message: 'A wallet is already linked to this account. The registered wallet was not changed.' });
    }
    const existing = await User.findOne({ walletAddress: walletAddress.toLowerCase(), _id: { $ne: req.user._id } });
    if (existing) return res.status(409).json({ success: false, message: 'This wallet is already linked to another user account' });
    req.user.walletAddress = walletAddress.toLowerCase();
    await req.user.save();
    session.walletChallenge = null;
    session.walletChallengeExpiresAt = null;
    await session.save();
    res.json({ success: true, data: publicUser(req.user) });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Wallet signature could not be verified' });
  }
});

module.exports = router;
