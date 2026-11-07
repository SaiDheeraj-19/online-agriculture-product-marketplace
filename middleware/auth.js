function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  next();
}

function requireRole(role) {
  return function roleGuard(req, res, next) {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Please log in to continue.' });
    }
    if (req.session.user.role !== role) {
      return res.status(403).json({
        error: `This action is only available to ${role} accounts.`
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
