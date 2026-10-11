const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  recipientCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
  recipientWallet: { type: String, trim: true, lowercase: true, default: null },
  type: {
    type: String,
    enum: [
      'ACCESS_REQUEST_RECEIVED', 'ACCESS_REQUEST_APPROVED', 'ACCESS_REQUEST_REJECTED',
      'PURCHASE_CONFIRMED', 'DATASET_ADDED', 'TRANSACTION_CONFIRMED',
      'ACCESS_REQUEST_SUBMITTED', 'ETH_CREDITED', 'ETH_DEBITED'
    ],
    required: true
  },
  title: { type: String, required: true, maxlength: 100 },
  message: { type: String, required: true, maxlength: 500 },
  relatedDatasetId: { type: String, default: null },
  relatedDatasetName: { type: String, default: null, maxlength: 120 },
  relatedRequestId: { type: String, default: null },
  relatedTransactionHash: { type: String, default: null, lowercase: true },
  notificationKey: { type: String, required: true, unique: true, maxlength: 180 },
  read: { type: Boolean, default: false, index: true },
  cleared: { type: Boolean, default: false }
}, { timestamps: { createdAt: true, updatedAt: false } });

NotificationSchema.index({ recipientUserId: 1, createdAt: -1 });
NotificationSchema.index({ recipientUserId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ recipientWallet: 1, createdAt: -1 }, { sparse: true });
NotificationSchema.index({ recipientCompanyId: 1, createdAt: -1 });
NotificationSchema.index({ recipientCompanyId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
