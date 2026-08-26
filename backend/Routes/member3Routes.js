const express = require("express");

const router = express.Router();

const {
    uploadDataset,
    verifyDataset
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

module.exports = router;