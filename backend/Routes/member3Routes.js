const express = require("express");

const router = express.Router();
const requireAuth = require('../middleware/authMiddleware');

const {
    uploadDataset,
    verifyDataset,
    getIPFSData
} = require("../controllers/dataController");

// Member 3: Upload encrypted + hashed dataset
router.post(
    "/upload",
    requireAuth('user'),
    uploadDataset
);

// Member 3: Verify dataset integrity
router.get(
    "/verify/:datasetId",
    requireAuth('user', 'company'),
    verifyDataset
);

// Member 3: Retrieve encrypted dataset from IPFS with on-chain access verification
router.get(
    "/ipfs/:cid",
    requireAuth('user', 'company'),
    getIPFSData
);

module.exports = router;
