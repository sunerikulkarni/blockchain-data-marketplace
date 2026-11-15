const express = require("express");
const {
    listDatasets,
    getAccessRequestsForOwner,
    getAccessRequestsForRequester,
    getPurchaseEvents,
    getCompanyPurchaseAudit
} = require("../services/blockchainService");

const router = express.Router();
const requireAuth = require('../middleware/authMiddleware');

function walletScopedAuth(req, res, next) {
    const roles = req.query.owner || !req.query.requester ? ['user'] : ['user', 'company'];
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
        const datasetId = req.query.datasetId;

        if (requester) {
            const wallet = req.auth.role === 'user' ? req.user.walletAddress : req.company.walletAddress;
            const walletMatches = req.auth.role === 'user'
                ? wallet && wallet.toLowerCase() === requester.toLowerCase()
                : wallet === requester.toLowerCase();
            if (!walletMatches) {
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

        if (!/^0x[0-9a-fA-F]{40}$/.test(String(owner))) {
            return res.status(400).json({ success: false, message: 'A valid owner wallet is required' });
        }

        if (!req.user.walletAddress || req.user.walletAddress.toLowerCase() !== owner.toLowerCase()) {
            return res.status(403).json({ success: false, message: 'Owner wallet does not match the authenticated user' });
        }

        const result = await getAccessRequestsForOwner(owner);
        if (datasetId !== undefined) {
            if (!/^\d+$/.test(String(datasetId)) || !result.owned.some((dataset) => String(dataset.id) === String(datasetId))) {
                return res.status(403).json({ success: false, message: 'Dataset is not owned by the authenticated user' });
            }
        }
        const requests = datasetId === undefined
            ? result.requests
            : result.requests.filter((request) => String(request.dataId) === String(datasetId));
        res.json({
            success: true,
            count: requests.length,
            ownedCount: datasetId === undefined ? result.owned.length : 1,
            data: requests
        });
    } catch (error) {
        console.error("GET /chain/access-requests error:", error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get("/chain/purchases", requireAuth('user', 'company'), async (req, res) => {
    try {
        const wallet = req.query.wallet || null;
        if (!wallet) {
            return res.status(400).json({ success: false, message: 'An authorized wallet is required' });
        }
        if (wallet) {
            const authenticatedWallet = req.auth.role === 'user' ? req.user.walletAddress : req.company.walletAddress;
            const walletMatches = req.auth.role === 'user'
                ? authenticatedWallet && authenticatedWallet.toLowerCase() === wallet.toLowerCase()
                : authenticatedWallet === wallet.toLowerCase();
            if (!walletMatches) {
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

router.get("/chain/purchases/audit", requireAuth('company'), async (req, res) => {
    try {
        const wallet = req.company.walletAddress;
        if (!wallet) {
            return res.status(403).json({ success: false, message: 'Link a wallet to your company account before auditing purchases' });
        }
        const data = await getCompanyPurchaseAudit(wallet);
        res.json({ success: true, data });
    } catch (error) {
        console.error("GET /chain/purchases/audit error:", error.message);
        res.status(502).json({ success: false, message: 'Unable to audit confirmed company purchases' });
    }
});

module.exports = router;
