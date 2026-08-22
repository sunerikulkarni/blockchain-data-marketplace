// middleware/adminMiddleware.js
// Simple admin wallet verification middleware.
//
// The admin wallet is stored in .env.
// The frontend/admin panel must send:
// x-admin-wallet: <admin-wallet-address>

function adminMiddleware(req, res, next) {
  const adminWallet = process.env.ADMIN_WALLET;

  if (!adminWallet) {
    return res.status(500).json({
      success: false,
      message: 'ADMIN_WALLET is not configured on the server',
    });
  }

  const requestWallet = req.headers['x-admin-wallet'];

  if (!requestWallet) {
    return res.status(401).json({
      success: false,
      message: 'Admin wallet is required',
    });
  }

  if (
    requestWallet.toLowerCase() !==
    adminWallet.toLowerCase()
  ) {
    return res.status(403).json({
      success: false,
      message: 'Admin access denied',
    });
  }

  next();
}

module.exports = adminMiddleware;