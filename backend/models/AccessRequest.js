// models/AccessRequest.js
// Stores requests made by verified companies to access datasets.

const mongoose = require('mongoose');

const AccessRequestSchema = new mongoose.Schema(
  {
    // Dataset being requested
    dataId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Data',
      required: [true, 'Dataset ID is required'],
    },

    // Owner/seller wallet of the dataset
    ownerWallet: {
      type: String,
      required: [true, 'Owner wallet is required'],
      trim: true,
      lowercase: true,
      match: [
        /^0x[a-fA-F0-9]{40}$/,
        'Invalid owner wallet address',
      ],
    },

    // Company requesting access
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
    },

    // Wallet of the company requesting access
    buyerWallet: {
      type: String,
      required: [true, 'Buyer wallet is required'],
      trim: true,
      lowercase: true,
      match: [
        /^0x[a-fA-F0-9]{40}$/,
        'Invalid buyer wallet address',
      ],
    },

    // Why the company wants the data
    purpose: {
      type: String,
      required: [true, 'Purpose of access is required'],
      trim: true,
      maxlength: [500, 'Purpose cannot exceed 500 characters'],
    },

    // Request status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // Optional reason for rejection
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    // Time when request was approved
    approvedAt: {
      type: Date,
      default: null,
    },

    // Time when request was rejected
    rejectedAt: {
      type: Date,
      default: null,
    },

    // Blockchain request reference.
    // Member 4 can populate this later.
    blockchainRequestId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Useful for retrieving all requests for a dataset
AccessRequestSchema.index({ dataId: 1 });

// Useful for retrieving requests made by a company
AccessRequestSchema.index({ companyId: 1 });

// Useful for retrieving requests by buyer wallet
AccessRequestSchema.index({ buyerWallet: 1 });

// Useful for finding requests belonging to an owner
AccessRequestSchema.index({ ownerWallet: 1 });

// Prevent multiple simultaneous pending requests
// from the same company for the same dataset.
AccessRequestSchema.index(
  {
    dataId: 1,
    companyId: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending',
    },
  }
);

module.exports = mongoose.model(
  'AccessRequest',
  AccessRequestSchema
);