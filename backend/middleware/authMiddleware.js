const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the JWT and attaches the user to req.user.
// Accepts the token either as a Bearer header (normal API calls) or as a
// ?token= query param — the latter is needed for routes opened as a direct
// browser/Linking URL (e.g. PDF downloads), where custom headers can't be set.
const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  // `code: 'SESSION_INVALID'` lets the frontend tell "your session is dead,
  // log out" apart from ordinary 401s like a wrong password on login.
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided', code: 'SESSION_INVALID' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, user no longer exists', code: 'SESSION_INVALID' });
    }

    // A password reset (by an admin, or via forgot-password) invalidates every
    // session that was issued before it. JWT `iat` is in whole seconds, so
    // compare in seconds — a token minted in the same second as the reset is fine.
    if (req.user.passwordChangedAt && decoded.iat < Math.floor(req.user.passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({
        message: 'Your password was reset — please log in again',
        code: 'SESSION_INVALID',
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token invalid or expired', code: 'SESSION_INVALID' });
  }
};

// Restricts a route to specific roles, e.g. authorize('admin'), authorize('admin', 'faculty')
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. This action requires role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
