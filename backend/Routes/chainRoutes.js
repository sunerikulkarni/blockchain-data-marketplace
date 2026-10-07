const express = require("express");
const {
    listDatasets,
    getAccessRequestsForOwner,
    getAccessRequestsForRequester,
    getPurchaseEvents
} = require("../services/blockchainService");

const router = express.Router();
const requireAuth = require('../middleware/authMiddleware');

function walletScopedAuth(req, res, next) {
    const roles = req.query.owner ? ['user'] : ['user', 'company'];
    return requireAuth(...roles)(req, res, next);
}

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

router.get("/chain/access-requests", walletScopedAuth, async (req, res) => {
    try {
        const owner = req.query.owner;
        const requester = req.query.requester;

        if (requester) {
            const wallet = req.auth.role === 'user' ? req.user.walletAddress : req.company.walletAddress;
            if (!wallet || wallet !== requester.toLowerCase()) {
                return res.status(403).json({ success: false, message: 'Wallet does not match the authenticated account' });
            }
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

        if (!req.user.walletAddress || req.user.walletAddress !== owner.toLowerCase()) {
            return res.status(403).json({ success: false, message: 'Owner wallet does not match the authenticated user' });
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

router.get("/chain/purchases", (req, res, next) => req.query.wallet
    ? requireAuth('user', 'company')(req, res, next)
    : next(), async (req, res) => {
    try {
        const wallet = req.query.wallet || null;
        if (wallet) {
            const authenticatedWallet = req.auth.role === 'user' ? req.user.walletAddress : req.company.walletAddress;
            if (!authenticatedWallet || authenticatedWallet !== wallet.toLowerCase()) {
                return res.status(403).json({ success: false, message: 'Wallet does not match the authenticated account' });
            }
        }
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
