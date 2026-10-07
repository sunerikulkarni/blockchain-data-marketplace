const express = require('express');
const requireAuth = require('../middleware/authMiddleware');
const { listDatasets, getAccessRequestsForOwner, getAccessRequestsForRequester, getPurchaseEvents, getAccessStatus } = require('../services/blockchainService');

const router = express.Router();

router.get('/dashboard/user', requireAuth('user'), async (req, res) => {
  try {
    const wallet = req.user.walletAddress;
    const [listingResult, purchases, requested, received] = wallet
      ? await Promise.all([
          listDatasets(), getPurchaseEvents(wallet),
          getAccessRequestsForRequester(wallet), getAccessRequestsForOwner(wallet)
        ])
      : [{ datasets: [] }, [], [], { requests: [] }];
    const owned = wallet ? listingResult.datasets.filter(d => d.owner.toLowerCase() === wallet) : [];
    const buys = purchases.filter(p => p.buyer.toLowerCase() === wallet);
    const sales = purchases.filter(p => p.owner.toLowerCase() === wallet);
    const recentDatasets = owned.slice().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 5);
    const activity = [
      ...buys.map(item => ({ ...item, type: 'purchase' })),
      ...sales.map(item => ({ ...item, type: 'sale' })),
      ...requested.map(item => ({ ...item, type: 'request' })),
      ...received.requests.map(item => ({ ...item, type: 'request_received' }))
    ].sort((a, b) => Number(b.blockNumber || 0) - Number(a.blockNumber || 0)).slice(0, 8);
    res.json({ success: true, data: {
      user: { fullName: req.user.fullName, email: req.user.email, walletAddress: wallet || null },
      ownedCount: owned.length,
      recentDatasets,
      purchases: buys,
      sales,
      accessRequestsMade: requested,
      accessRequestsReceived: received.requests,
      activity
    } });
  } catch (error) {
    console.error('GET /dashboard/user error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load user dashboard data' });
  }
});

router.get('/dashboard/company', requireAuth('company'), async (req, res) => {
  try {
    const wallet = req.company.walletAddress.toLowerCase();
    const [allPurchases, requests] = await Promise.all([
      getPurchaseEvents(wallet),
      getAccessRequestsForRequester(wallet)
    ]);
    const purchases = allPurchases.filter(item => item.buyer.toLowerCase() === wallet);
    const authorizedDatasets = await Promise.all(purchases.map(async purchase => {
      const access = await getAccessStatus(purchase.dataId, wallet);
      return { ...purchase, accessStatus: access.label, statusCode: access.status };
    }));
    res.json({ success: true, data: {
      company: {
        id: req.company._id,
        companyName: req.company.companyName,
        email: req.company.email,
        registrationNumber: req.company.registrationNumber,
        walletAddress: wallet,
        verificationStatus: req.company.verificationStatus
      },
      purchasedCount: purchases.length,
      authorizedDatasets,
      pendingAccessRequests: requests.filter(item => item.status === 'PENDING'),
      accessRequests: requests,
      recentPurchases: purchases.slice(0, 8)
    } });
  } catch (error) {
    console.error('GET /dashboard/company error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load company dashboard data' });
  }
});

module.exports = router;
