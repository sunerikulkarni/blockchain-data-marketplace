// routes/dataRoutes.js
// Handles all CRUD operations for dataset listings.

const express  = require('express');
const { body, query, validationResult } = require('express-validator');
const Data     = require('../models/Data');

const router = express.Router();

// ── Helper: send validation errors ───────────────────────────
function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return true; // signals "there were errors"
  }
  return false;
}

// ────────────────────────────────────────────────────────────
// GET /getData
// Returns all active dataset listings.
// Supports optional ?search=keyword and ?category=Health
// ────────────────────────────────────────────────────────────
router.get('/getData', async (req, res) => {
  try {
    const { search, category, page = 1, limit = 50 } = req.query;

    // Build filter object
    const filter = { status: 'active' };

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (search) {
      // Text search across name and description
      filter.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category:    { $regex: search, $options: 'i' } },
      ];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Data.countDocuments(filter);
    const data  = await Data.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: data.length,
      total,
      page: parseInt(page),
      data,
    });
  } catch (err) {
    console.error('GET /getData error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /getData/:id
// Returns a single dataset by its MongoDB ObjectId.
// ────────────────────────────────────────────────────────────
router.get('/getData/:id', async (req, res) => {
  try {
    const data = await Data.findById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Dataset not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /addData
// Creates a new dataset listing.
// Body: { name, category, description, price, seller? }
// ────────────────────────────────────────────────────────────
router.post(
  '/addData',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('category').isIn(['Health','Finance','Technology','Environment','Education','Research','Other'])
      .withMessage('Invalid category'),
    body('description').trim().notEmpty().withMessage('Description is required').isLength({ max: 500 }),
    body('price').notEmpty().withMessage('Price is required')
      .custom(v => parseFloat(v) > 0).withMessage('Price must be > 0'),
  ],
  async (req, res) => {
    if (validate(req, res)) return;
    try {
      const { name, category, description, price, seller } = req.body;
      const newData = await Data.create({ name, category, description, price, seller: seller || null });
      res.status(201).json({ success: true, data: newData });
    } catch (err) {
      console.error('POST /addData error:', err.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ────────────────────────────────────────────────────────────
// PUT /updateData/:id
// Updates an existing listing (name, description, price, status).
// ────────────────────────────────────────────────────────────
router.put(
  '/updateData/:id',
  [
    body('price').optional().custom(v => parseFloat(v) > 0).withMessage('Price must be > 0'),
    body('status').optional().isIn(['active','inactive']),
  ],
  async (req, res) => {
    if (validate(req, res)) return;
    try {
      const allowed = ['name', 'description', 'price', 'status'];
      const updates = {};
      allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });

      const data = await Data.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
      if (!data) return res.status(404).json({ success: false, message: 'Dataset not found' });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ────────────────────────────────────────────────────────────
// DELETE /deleteData/:id
// Removes a listing permanently.
// ────────────────────────────────────────────────────────────
router.delete('/deleteData/:id', async (req, res) => {
  try {
    const data = await Data.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Dataset not found' });
    res.json({ success: true, message: 'Dataset deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /categories
// Returns all available categories with dataset counts.
// ────────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const counts = await Data.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, data: counts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
