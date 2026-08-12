// routes/transactionRoutes.js
// Records and retrieves purchase transactions.

const express = require('express');
const { body, validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const Data        = require('../models/Data');

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
// Body: { dataId, buyer?, txHash? }
// ────────────────────────────────────────────────────────────
router.post(
  '/buyData',
  [
    body('dataId').notEmpty().withMessage('dataId is required'),
  ],
  async (req, res) => {
    if (validate(req, res)) return;
    try {
      const { dataId, buyer, txHash } = req.body;

      // Fetch the dataset being purchased
      const dataset = await Data.findById(dataId);
      if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });
      if (dataset.status !== 'active') return res.status(400).json({ success: false, message: 'Dataset is not available' });

      // Record the transaction
      const txn = await Transaction.create({
        dataId:   dataset._id,
        dataName: dataset.name,
        buyer:    buyer   || null,
        seller:   dataset.seller || null,
        amount:   dataset.price,
        category: dataset.category,
        txHash:   txHash  || null,
        status:   'confirmed',
      });

      // Increment the sales counter on the dataset
      await Data.findByIdAndUpdate(dataId, { $inc: { sales: 1 } });

      res.status(201).json({ success: true, transaction: txn });
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
router.get('/transactions', async (req, res) => {
  try {
    const { wallet, type, page = 1, limit = 30 } = req.query;
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
router.get('/transactions/stats', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ success: false, message: 'wallet param required' });

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
