// models/Transaction.js
// Records every buy/sell event on the platform.

const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    // Reference to the dataset that was bought/sold
    dataId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Data',
      required: true,
    },

    // Snapshot of the dataset name at time of purchase (in case it changes later)
    dataName: {
      type: String,
      required: true,
    },

    // Wallet address of the buyer
    buyer: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    // Wallet address of the seller
    seller: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    // ETH amount paid
    amount: {
      type: String,
      required: true,
    },

    // Category copied from the dataset (useful for analytics)
    category: {
      type: String,
    },

    // On-chain transaction hash (populated when real blockchain integration exists)
    txHash: {
      type: String,
      default: null,
    },

    // Confirmed = recorded on-chain / pending = awaiting confirmation
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed'],
      default: 'confirmed',
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ buyer: 1 });
TransactionSchema.index({ seller: 1 });
TransactionSchema.index({ dataId: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
