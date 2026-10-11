const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const requireAuth = require('../middleware/authMiddleware');
const { ingestConfirmedTransaction } = require('../services/notificationService');

const router = express.Router();
const userAuth = requireAuth('user');
const companyAuth = requireAuth('company');

// Company queries are scoped by the authenticated account ID and its registered wallet.
const companyFilter = req => ({ recipientCompanyId: req.company._id, recipientWallet: req.company.walletAddress, cleared: { $ne: true } });

router.get('/company/notifications', companyAuth, async (req, res) => {
  try {
    const data = await Notification.find(companyFilter(req))
      .select('-recipientUserId -recipientCompanyId -recipientWallet -notificationKey -cleared -__v')
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Company notifications failed:', error.message);
    res.status(503).json({ success: false, message: 'Notifications are unavailable' });
  }
});

router.get('/company/notifications/unread-count', companyAuth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ ...companyFilter(req), read: false });
    res.json({ success: true, count });
  } catch (error) {
    console.error('Company notification count failed:', error.message);
    res.status(503).json({ success: false, message: 'Notification count is unavailable' });
  }
});

router.patch('/company/notifications/read-all', companyAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany({ ...companyFilter(req), read: false }, { $set: { read: true } });
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Company mark all read failed:', error.message);
    res.status(503).json({ success: false, message: 'Notifications could not be updated' });
  }
});

router.patch('/company/notifications/clear-all', companyAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(companyFilter(req), { $set: { cleared: true, read: true } });
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Company clear all failed:', error.message);
    res.status(503).json({ success: false, message: 'Notifications could not be cleared' });
  }
});

router.patch('/company/notifications/:id/read', companyAuth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }
  try {
    const data = await Notification.findOneAndUpdate(
      { ...companyFilter(req), _id: req.params.id }, { $set: { read: true } }, { new: true }
    ).select('_id read');
    if (!data) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Company mark read failed:', error.message);
    res.status(503).json({ success: false, message: 'Notification could not be updated' });
  }
});

router.get('/notifications', userAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientUserId: req.user._id, cleared: { $ne: true } })
      .select('-recipientUserId -recipientWallet -notificationKey -cleared -__v')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('GET /notifications failed:', error.message);
    res.status(503).json({ success: false, message: 'Notifications are unavailable' });
  }
});

router.get('/notifications/unread-count', userAuth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipientUserId: req.user._id, read: false, cleared: { $ne: true } });
    res.json({ success: true, count });
  } catch (error) {
    console.error('GET /notifications/unread-count failed:', error.message);
    res.status(503).json({ success: false, message: 'Notification count is unavailable' });
  }
});

router.patch('/notifications/:id/read', userAuth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientUserId: req.user._id, cleared: { $ne: true } },
      { $set: { read: true } },
      { new: true }
    ).select('_id read');
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data: notification });
  } catch (error) {
    console.error('PATCH notification read failed:', error.message);
    res.status(503).json({ success: false, message: 'Notification could not be updated' });
  }
});

router.patch('/notifications/read-all', userAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipientUserId: req.user._id, read: false, cleared: { $ne: true } },
      { $set: { read: true } }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('PATCH /notifications/read-all failed:', error.message);
    res.status(503).json({ success: false, message: 'Notifications could not be updated' });
  }
});

router.patch('/notifications/clear-all', userAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipientUserId: req.user._id, cleared: { $ne: true } },
      { $set: { cleared: true, read: true } }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('PATCH /notifications/clear-all failed:', error.message);
    res.status(503).json({ success: false, message: 'Notifications could not be cleared' });
  }
});

router.get('/notifications/preferences', userAuth, (req, res) => {
  res.json({ success: true, notificationsEnabled: req.user.notificationsEnabled !== false });
});

router.patch('/notifications/preferences', userAuth, async (req, res) => {
  if (typeof req.body?.notificationsEnabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'notificationsEnabled must be true or false' });
  }
  try {
    const user = await User.findByIdAndUpdate(req.user._id,
      { $set: { notificationsEnabled: req.body.notificationsEnabled } },
      { new: true, projection: 'notificationsEnabled' }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User account was not found' });
    res.json({ success: true, notificationsEnabled: user.notificationsEnabled !== false });
  } catch (error) {
    console.error('PATCH notification preference failed:', error.message);
    res.status(503).json({ success: false, message: 'Notification preference could not be saved' });
  }
});

// This ingestion endpoint accepts only a transaction hash. The backend verifies
// the successful receipt and marketplace event, then derives recipients itself.
router.post('/notifications/ingest', requireAuth('user', 'company'), async (req, res) => {
  const actorWallet = req.auth.role === 'user' ? req.user.walletAddress : req.company.walletAddress;
  if (!actorWallet) return res.status(403).json({ success: false, message: 'Link a wallet before syncing an event' });
  try {
    const result = await ingestConfirmedTransaction({
      transactionHash: req.body?.transactionHash,
      actorRole: req.auth.role,
      actorWallet
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.warn('POST /notifications/ingest rejected:', error.message);
    res.status(400).json({ success: false, message: error.message || 'Marketplace event could not be verified' });
  }
});

module.exports = router;
