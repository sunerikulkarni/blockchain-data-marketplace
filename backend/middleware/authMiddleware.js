const AuthSession = require('../models/AuthSession');
const User = require('../models/User');
const Company = require('../models/Company');
const { verifyToken } = require('../services/authService');

function requireAuth(...roles) {
  return async (req, res, next) => {
    try {
      const authorization = req.headers.authorization || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });

      const claims = verifyToken(token);
      if (roles.length && !roles.includes(claims.role)) {
        return res.status(403).json({ success: false, message: 'This page or action is not available for your role' });
      }

      const session = await AuthSession.findOne({
        tokenId: claims.jti,
        subjectId: claims.sub,
        role: claims.role,
        expiresAt: { $gt: new Date() }
      });
      if (!session) return res.status(401).json({ success: false, message: 'Session expired or logged out' });

      req.auth = { role: claims.role, subjectId: claims.sub, sessionId: claims.jti, session };
      if (claims.role === 'user') {
        req.user = await User.findById(claims.sub).select('fullName email walletAddress');
        if (!req.user) return res.status(401).json({ success: false, message: 'Account no longer exists' });
      } else if (claims.role === 'company') {
        req.company = await Company.findById(claims.sub).select('-passwordHash -__v');
        if (!req.company) return res.status(401).json({ success: false, message: 'Company account no longer exists' });
        if (req.company.verificationStatus !== 'verified') {
          return res.status(403).json({
            success: false,
            code: req.company.verificationStatus === 'rejected' ? 'COMPANY_REJECTED' : 'COMPANY_PENDING',
            message: req.company.verificationStatus === 'rejected'
              ? 'Company verification was rejected'
              : 'Company verification is pending'
          });
        }
      }
      return next();
    } catch (error) {
      if (error.name === 'MongoError' || error.name === 'MongooseError' || error.name === 'MongoServerSelectionError') {
        return res.status(503).json({ success: false, message: 'Authentication service is unavailable' });
      }
      return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }
  };
}

module.exports = requireAuth;
