// routes/transactionRoutes.js
// Records and retrieves purchase transactions.

const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const Data        = require('../models/Data');
const requireAuth = require('../middleware/authMiddleware');
const { ethers } = require('ethers');
const { getConfirmedMarketplaceTransaction, getDataset } = require('../services/blockchainService');

const router = express.Router();

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ success: false, errors: errors.array() }); return true; }
  return false;
}

// ────────────────────────────────────────────────────────────
// POST /buyData
// Records a purchase: increments the dataset's sales counter
// and creates a Transaction document.
// Body: { dataId, txHash }. Purchase details are derived from a confirmed
// DataPurchased event; client-supplied amount, buyer, seller and name are ignored.
// ────────────────────────────────────────────────────────────
router.post(
  '/buyData',
  requireAuth('user', 'company'),
  [
    body('dataId').notEmpty().withMessage('dataId is required'),
  ],
  async (req, res) => {
    if (validate(req, res)) return;
    try {
      const { dataId, txHash } = req.body;
      const authenticatedWallet = req.auth.role === 'user'
        ? req.user.walletAddress
        : req.company.walletAddress;
      if (!authenticatedWallet) return res.status(403).json({ success: false, message: 'Link a wallet to your account before recording a purchase' });
      if (!ethers.isHexString(txHash || '', 32)) {
        return res.status(400).json({ success: false, message: 'A confirmed purchase transaction hash is required' });
      }
      const existing = await Transaction.findOne({ txHash: txHash.toLowerCase() });
      if (existing) {
        if (String(existing.buyer || '').toLowerCase() !== authenticatedWallet.toLowerCase()) {
          return res.status(409).json({ success: false, message: 'Transaction hash is already associated with another account' });
        }
        return res.json({ success: true, transaction: existing, duplicate: true });
      }

      const receipt = await getConfirmedMarketplaceTransaction(txHash);
      const purchase = receipt.events.find(event => event.name === 'DataPurchased' &&
        String(event.args.buyer ?? event.args[1]).toLowerCase() === authenticatedWallet.toLowerCase());
      if (!purchase) return res.status(403).json({ success: false, message: 'Confirmed transaction has no purchase for the authenticated wallet' });

      const purchasedId = String(purchase.args.dataId ?? purchase.args[0]);
      const dataset = await getDataset(purchasedId);
      const requestedMongoId = mongoose.Types.ObjectId.isValid(dataId) && String(new mongoose.Types.ObjectId(dataId)) === String(dataId);
      const mongoDataset = requestedMongoId ? await Data.findById(dataId) : null;
      if (requestedMongoId && (!mongoDataset || String(mongoDataset.blockchainId) !== purchasedId)) {
        return res.status(409).json({ success: false, message: 'Transaction purchase does not match the requested dataset' });
      }
      if (!requestedMongoId && String(dataId) !== purchasedId) {
        return res.status(409).json({ success: false, message: 'Transaction purchase does not match the requested dataset' });
      }

      const txn = await Transaction.create({
        dataId: mongoDataset?._id || null,
        blockchainId: Number(purchasedId),
        dataName: dataset.name,
        buyer: String(purchase.args.buyer ?? purchase.args[1]).toLowerCase(),
        seller: String(purchase.args.owner ?? purchase.args[2]).toLowerCase(),
        amount: ethers.formatEther(purchase.args.amount ?? purchase.args[3]),
        category: dataset.category,
        txHash: receipt.transactionHash.toLowerCase(),
        status: 'confirmed',
      });
      if (mongoDataset) await Data.findByIdAndUpdate(mongoDataset._id, { $inc: { sales: 1 } });
      return res.status(201).json({ success: true, transaction: txn });
    } catch (err) {
      console.error('POST /buyData error:', err.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ────────────────────────────────────────────────────────────
// GET /transactions
// Returns transaction history, optionally filtered by wallet.
// Query: ?wallet=0xABC&type=buy|sell&page=1&limit=20
// ────────────────────────────────────────────────────────────
router.get('/transactions', requireAuth('user', 'company'), async (req, res) => {
  try {
    const { type, page = 1, limit = 30 } = req.query;
    const wallet = req.auth.role === 'user' ? req.user.walletAddress : req.company.walletAddress;
    if (!wallet) return res.status(403).json({ success: false, message: 'Link a wallet to view account transactions' });
    const filter = {};

    if (wallet) {
      const addr = wallet.toLowerCase();
      if (type === 'buy')  filter.buyer  = addr;
      else if (type === 'sell') filter.seller = addr;
      else filter.$or = [{ buyer: addr }, { seller: addr }];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Transaction.countDocuments(filter);
    const txns  = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('dataId', 'name category');

    res.json({ success: true, count: txns.length, total, data: txns });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /transactions/stats
// Returns summary stats (total spent, earned, count) for a wallet.
// Query: ?wallet=0xABC
// ────────────────────────────────────────────────────────────
router.get('/transactions/stats', requireAuth('user', 'company'), async (req, res) => {
  try {
    const wallet = req.auth.role === 'user' ? req.user.walletAddress : req.company.walletAddress;
    if (!wallet) return res.status(403).json({ success: false, message: 'Link a wallet to view account transactions' });

    const addr = wallet.toLowerCase();

    const [purchases, sales] = await Promise.all([
      Transaction.find({ buyer: addr, status: 'confirmed' }),
      Transaction.find({ seller: addr, status: 'confirmed' }),
    ]);

    const spent  = purchases.reduce((s, t) => s + parseFloat(t.amount), 0);
    const earned = sales.reduce((s, t) => s + parseFloat(t.amount), 0);

    res.json({
      success: true,
      data: {
        totalPurchases: purchases.length,
        totalSales:     sales.length,
        ethSpent:       spent.toFixed(4),
        ethEarned:      earned.toFixed(4),
        netBalance:     (earned - spent).toFixed(4),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
