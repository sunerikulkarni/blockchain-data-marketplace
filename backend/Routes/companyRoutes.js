// routes/companyRoutes.js
// Handles company registration and admin verification.

const express = require('express');
const {
  body,
  validationResult,
} = require('express-validator');

const Company = require('../models/Company');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = express.Router();

// Helper for validation errors
function validate(req, res) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      errors: errors.array(),
    });

    return true;
  }

  return false;
}


// ============================================================
// POST /companies/register
// Register a new company/data consumer.
// ============================================================

router.post(
  '/companies/register',
  [
    body('companyName')
      .trim()
      .notEmpty()
      .withMessage('Company name is required')
      .isLength({ max: 150 })
      .withMessage('Company name cannot exceed 150 characters'),

    body('email')
      .trim()
      .isEmail()
      .withMessage('Valid company email is required'),

    body('registrationNumber')
      .trim()
      .notEmpty()
      .withMessage('Registration number is required'),

    body('walletAddress')
      .trim()
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Valid Ethereum wallet address is required'),

    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),
  ],

  async (req, res) => {
    if (validate(req, res)) return;

    try {
      const {
        companyName,
        email,
        registrationNumber,
        walletAddress,
        description,
      } = req.body;

      const normalizedWallet =
        walletAddress.toLowerCase();

      // Check whether wallet is already registered
      const existingWallet = await Company.findOne({
        walletAddress: normalizedWallet,
      });

      if (existingWallet) {
        return res.status(409).json({
          success: false,
          message: 'This wallet is already registered',
        });
      }

      // Check registration number
      const existingRegistration =
        await Company.findOne({
          registrationNumber,
        });

      if (existingRegistration) {
        return res.status(409).json({
          success: false,
          message:
            'This company registration number is already registered',
        });
      }

      // Create company with pending status
      const company = await Company.create({
        companyName,
        email,
        registrationNumber,
        walletAddress: normalizedWallet,
        description: description || '',
        verificationStatus: 'pending',
      });

      res.status(201).json({
        success: true,
        message:
          'Company registered successfully. Waiting for verification.',
        data: company,
      });

    } catch (err) {
      console.error(
        'POST /companies/register error:',
        err.message
      );

      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);


// ============================================================
// GET /companies/status/:wallet
// Get verification status of a company.
// ============================================================

router.get(
  '/companies/status/:wallet',
  async (req, res) => {
    try {
      const wallet =
        req.params.wallet.toLowerCase();

      const company = await Company.findOne({
        walletAddress: wallet,
      }).select('-__v');

      if (!company) {
        return res.status(404).json({
          success: false,
          message: 'Company not found',
        });
      }

      res.json({
        success: true,
        data: {
          companyId: company._id,
          companyName: company.companyName,
          walletAddress: company.walletAddress,
          verificationStatus:
            company.verificationStatus,
          rejectionReason:
            company.rejectionReason,
          verifiedAt: company.verifiedAt,
        },
      });

    } catch (err) {
      console.error(
        'GET /companies/status error:',
        err.message
      );

      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);


// ============================================================
// GET /companies/pending
// Admin: Get companies waiting for verification.
// ============================================================

router.get(
  '/companies/pending',
  adminMiddleware,
  async (req, res) => {
    try {
      const companies = await Company.find({
        verificationStatus: 'pending',
      }).sort({ createdAt: 1 });

      res.json({
        success: true,
        count: companies.length,
        data: companies,
      });

    } catch (err) {
      console.error(
        'GET /companies/pending error:',
        err.message
      );

      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);


// ============================================================
// PUT /companies/:id/verify
// Admin: Approve or reject a company.
// ============================================================

router.put(
  '/companies/:id/verify',
  adminMiddleware,

  [
    body('status')
      .isIn(['verified', 'rejected'])
      .withMessage(
        'Status must be either verified or rejected'
      ),

    body('rejectionReason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage(
        'Rejection reason cannot exceed 500 characters'
      ),
  ],

  async (req, res) => {
    if (validate(req, res)) return;

    try {
      const { status, rejectionReason } = req.body;

      const company = await Company.findById(
        req.params.id
      );

      if (!company) {
        return res.status(404).json({
          success: false,
          message: 'Company not found',
        });
      }

      if (
        company.verificationStatus !== 'pending'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'This company has already been processed',
        });
      }

      if (status === 'verified') {
        company.verificationStatus = 'verified';
        company.verifiedAt = new Date();
        company.rejectionReason = null;
      }

      if (status === 'rejected') {
        company.verificationStatus = 'rejected';
        company.verifiedAt = null;
        company.rejectionReason =
          rejectionReason || 'Company verification rejected';
      }

      await company.save();

      res.json({
        success: true,
        message:
          status === 'verified'
            ? 'Company verified successfully'
            : 'Company rejected successfully',
        data: company,
      });

    } catch (err) {
      console.error(
        'PUT /companies/:id/verify error:',
        err.message
      );

      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

module.exports = router;