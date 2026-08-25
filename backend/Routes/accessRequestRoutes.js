// routes/accessRequestRoutes.js
// Handles access requests made by verified companies
// for datasets listed by users.

const express = require('express');
const {
  body,
  validationResult,
} = require('express-validator');

const AccessRequest = require('../models/AccessRequest');
const Company = require('../models/Company');
const Data = require('../models/Data');

const router = express.Router();


// ============================================================
// Helper: validation errors
// ============================================================

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
// POST /access-requests
//
// A verified company requests access to a dataset.
// ============================================================

router.post(
  '/access-requests',

  [
    body('dataId')
      .notEmpty()
      .withMessage('Dataset ID is required'),

    body('companyId')
      .notEmpty()
      .withMessage('Company ID is required'),

    body('buyerWallet')
      .trim()
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Valid buyer wallet is required'),

    body('purpose')
      .trim()
      .notEmpty()
      .withMessage('Purpose of access is required')
      .isLength({ max: 500 })
      .withMessage(
        'Purpose cannot exceed 500 characters'
      ),
  ],

  async (req, res) => {
    if (validate(req, res)) return;

    try {
      const {
        dataId,
        companyId,
        buyerWallet,
        purpose,
      } = req.body;

      // ------------------------------------------------------
      // 1. Check whether dataset exists
      // ------------------------------------------------------

      const dataset = await Data.findById(dataId);

      if (!dataset) {
        return res.status(404).json({
          success: false,
          message: 'Dataset not found',
        });
      }

      // ------------------------------------------------------
      // 2. Dataset must be active
      // ------------------------------------------------------

      if (dataset.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'This dataset is not available',
        });
      }

      // ------------------------------------------------------
      // 3. Check whether company exists
      // ------------------------------------------------------

      const company = await Company.findById(companyId);

      if (!company) {
        return res.status(404).json({
          success: false,
          message: 'Company not found',
        });
      }

      // ------------------------------------------------------
      // 4. Check that wallet belongs to this company
      // ------------------------------------------------------

      const normalizedWallet =
        buyerWallet.toLowerCase();

      if (company.walletAddress !== normalizedWallet) {
        return res.status(403).json({
          success: false,
          message:
            'Buyer wallet does not belong to this company',
        });
      }

      // ------------------------------------------------------
      // 5. Only verified companies can request access
      // ------------------------------------------------------

      if (
        company.verificationStatus !== 'verified'
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Only verified companies can request dataset access',
        });
      }

      // ------------------------------------------------------
      // 6. Dataset must have an owner
      // ------------------------------------------------------

      if (!dataset.seller) {
        return res.status(400).json({
          success: false,
          message:
            'Dataset does not have a registered owner wallet',
        });
      }

      // ------------------------------------------------------
      // 7. Owner cannot request their own dataset
      // ------------------------------------------------------

      if (
        dataset.seller.toLowerCase() ===
        normalizedWallet
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Dataset owner cannot request their own dataset',
        });
      }

      // ------------------------------------------------------
      // 8. Check for an existing pending request
      // ------------------------------------------------------

      const existingRequest =
        await AccessRequest.findOne({
          dataId: dataset._id,
          companyId: company._id,
          status: 'pending',
        });

      if (existingRequest) {
        return res.status(409).json({
          success: false,
          message:
            'A pending access request already exists',
          data: existingRequest,
        });
      }

      // ------------------------------------------------------
      // 9. Create access request
      // ------------------------------------------------------

      const request = await AccessRequest.create({
        dataId: dataset._id,

        ownerWallet:
          dataset.seller.toLowerCase(),

        companyId: company._id,

        buyerWallet: normalizedWallet,

        purpose,

        status: 'pending',
      });

      // ------------------------------------------------------
      // 10. Return populated request information
      // ------------------------------------------------------

      const populatedRequest =
        await AccessRequest.findById(request._id)
          .populate(
            'dataId',
            'name category description price seller'
          )
          .populate(
            'companyId',
            'companyName email walletAddress verificationStatus'
          );

      res.status(201).json({
        success: true,
        message:
          'Access request submitted successfully',
        data: populatedRequest,
      });

    } catch (err) {
      console.error(
        'POST /access-requests error:',
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
// GET /access-requests/company/:wallet
//
// Get all requests made by a company.
// ============================================================

router.get(
  '/access-requests/company/:wallet',
  async (req, res) => {
    try {
      const wallet =
        req.params.wallet.toLowerCase();

      const requests =
        await AccessRequest.find({
          buyerWallet: wallet,
        })
          .sort({ createdAt: -1 })
          .populate(
            'dataId',
            'name category description price seller'
          )
          .populate(
            'companyId',
            'companyName email verificationStatus'
          );

      res.json({
        success: true,
        count: requests.length,
        data: requests,
      });

    } catch (err) {
      console.error(
        'GET company access requests error:',
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
// GET /access-requests/owner/:wallet
//
// Get all requests received by a dataset owner.
// ============================================================

router.get(
  '/access-requests/owner/:wallet',
  async (req, res) => {
    try {
      const wallet =
        req.params.wallet.toLowerCase();

      const requests =
        await AccessRequest.find({
          ownerWallet: wallet,
        })
          .sort({ createdAt: -1 })
          .populate(
            'dataId',
            'name category description price seller'
          )
          .populate(
            'companyId',
            'companyName email walletAddress verificationStatus'
          );

      res.json({
        success: true,
        count: requests.length,
        data: requests,
      });

    } catch (err) {
      console.error(
        'GET owner access requests error:',
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
// PUT /access-requests/:id/approve
//
// Dataset owner approves an access request.
// ============================================================

router.put(
  '/access-requests/:id/approve',

  [
    body('ownerWallet')
      .trim()
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage(
        'Valid owner wallet is required'
      ),
  ],

  async (req, res) => {
    if (validate(req, res)) return;

    try {
      const {
        ownerWallet,
      } = req.body;

      const normalizedWallet =
        ownerWallet.toLowerCase();

      const request =
        await AccessRequest.findById(
          req.params.id
        )
          .populate(
            'dataId',
            'name category description price seller'
          )
          .populate(
            'companyId',
            'companyName email walletAddress verificationStatus'
          );

      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Access request not found',
        });
      }

      // Make sure the requester is the dataset owner
      if (
        request.ownerWallet !==
        normalizedWallet
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Only the dataset owner can approve this request',
        });
      }

      // Request must still be pending
      if (request.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message:
            'This request has already been processed',
        });
      }

      request.status = 'approved';
      request.approvedAt = new Date();

      await request.save();

      res.json({
        success: true,
        message:
          'Access request approved',
        data: request,
      });

    } catch (err) {
      console.error(
        'PUT /access-requests/:id/approve error:',
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
// PUT /access-requests/:id/reject
//
// Dataset owner rejects an access request.
// ============================================================

router.put(
  '/access-requests/:id/reject',

  [
    body('ownerWallet')
      .trim()
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage(
        'Valid owner wallet is required'
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
      const {
        ownerWallet,
        rejectionReason,
      } = req.body;

      const normalizedWallet =
        ownerWallet.toLowerCase();

      const request =
        await AccessRequest.findById(
          req.params.id
        )
          .populate(
            'dataId',
            'name category description price seller'
          )
          .populate(
            'companyId',
            'companyName email walletAddress verificationStatus'
          );

      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Access request not found',
        });
      }

      // Make sure the requester is the dataset owner
      if (
        request.ownerWallet !==
        normalizedWallet
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Only the dataset owner can reject this request',
        });
      }

      // Request must still be pending
      if (request.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message:
            'This request has already been processed',
        });
      }

      request.status = 'rejected';
      request.rejectedAt = new Date();

      request.rejectionReason =
        rejectionReason ||
        'Access request rejected by data owner';

      await request.save();

      res.json({
        success: true,
        message:
          'Access request rejected',
        data: request,
      });

    } catch (err) {
      console.error(
        'PUT /access-requests/:id/reject error:',
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
// GET /access-requests/:id
//
// Get one particular access request.
// ============================================================

router.get(
  '/access-requests/:id',
  async (req, res) => {
    try {
      const request =
        await AccessRequest.findById(
          req.params.id
        )
          .populate(
            'dataId',
            'name category description price seller'
          )
          .populate(
            'companyId',
            'companyName email walletAddress verificationStatus'
          );

      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Access request not found',
        });
      }

      res.json({
        success: true,
        data: request,
      });

    } catch (err) {
      console.error(
        'GET /access-requests/:id error:',
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