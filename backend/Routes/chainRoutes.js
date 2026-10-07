const express = require("express");
const {
    listDatasets,
    getAccessRequestsForOwner,
    getAccessRequestsForRequester,
    getPurchaseEvents
} = require("../services/blockchainService");

const router = express.Router();

router.get("/chain/health", (req, res) => {
    res.json({
        success: true,
        pinataConfigured: Boolean(process.env.PINATA_JWT),
        encryptionConfigured: Boolean(process.env.ENCRYPTION_KEY),
        rpcConfigured: Boolean(process.env.BLOCKCHAIN_RPC_URL),
        contractConfigured: Boolean(process.env.CONTRACT_ADDRESS)
    });
});

router.get("/chain/datasets", async (req, res) => {
    try {
        const result = await listDatasets();
        res.json({
            success: true,
            count: result.count,
            data: result.datasets
        });
    } catch (error) {
        console.error("GET /chain/datasets error:", error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get("/chain/access-requests", async (req, res) => {
    try {
        const owner = req.query.owner;
        const requester = req.query.requester;

        if (requester) {
            const data = await getAccessRequestsForRequester(requester);
            return res.json({
                success: true,
                count: data.length,
                data
            });
        }

        if (!owner) {
            return res.status(400).json({
                success: false,
                message: "owner query parameter is required"
            });
        }

        const result = await getAccessRequestsForOwner(owner);
        res.json({
            success: true,
            count: result.requests.length,
            ownedCount: result.owned.length,
            data: result.requests
        });
    } catch (error) {
        console.error("GET /chain/access-requests error:", error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get("/chain/purchases", async (req, res) => {
    try {
        const wallet = req.query.wallet || null;
        const data = await getPurchaseEvents(wallet);
        res.json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error("GET /chain/purchases error:", error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
