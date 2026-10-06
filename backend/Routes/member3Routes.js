const express = require("express");

const router = express.Router();

const {
    uploadDataset,
    verifyDataset,
    getIPFSData
} = require("../controllers/dataController");

// Member 3: Upload encrypted + hashed dataset
router.post(
    "/upload",
    uploadDataset
);

// Member 3: Verify dataset integrity
router.get(
    "/verify/:datasetId",
    verifyDataset
);

// Member 3: Retrieve encrypted dataset from IPFS with on-chain access verification
router.get(
    "/ipfs/:cid",
    getIPFSData
);

module.exports = router;