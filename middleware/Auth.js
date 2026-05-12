const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────────────────────────
// protect
//
// BEFORE: did User.findById() on EVERY authenticated request.
// With rapid sign-in/sign-out cycles the frontend fires many parallel requests
// (cart, /me, admin/stats, etc.) each opening a DB query — this exhausts the
// MongoDB connection pool and crashes the server.
//
// FIX: trust the JWT payload for role/id. Only hit the DB when we actually
// need fresh user data (e.g. checking isActive after a ban). We cache a
// lightweight check: if the token is valid and not expired, let it through.
// The full user object is only fetched when isActive must be verified, and
// that fetch is skipped for the vast majority of normal requests.
// ─────────────────────────────────────────────────────────────────────────────
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "يجب تسجيل الدخول أولاً" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach decoded payload — no DB query needed for most routes
    // decoded contains: { id, iat, exp }
    req.user = { _id: decoded.id, id: decoded.id };

    // Only fetch from DB if the route handler explicitly needs req.user.role
    // or req.user.isActive. We do a single lean() fetch and cache it on req.
    // Routes that need full user data call req.getUser() themselves.
    req.getUser = async () => {
      if (req._cachedUser) return req._cachedUser;
      req._cachedUser = await User.findById(decoded.id)
        .select("-password")
        .lean();
      return req._cachedUser;
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "الجلسة منتهية، يرجى تسجيل الدخول مجدداً",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// adminOnly
//
// Must be used AFTER protect. Fetches user only once (cached on req).
// ─────────────────────────────────────────────────────────────────────────────
const adminOnly = async (req, res, next) => {
  try {
    const user = await req.getUser();
    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ success: false, message: "الحساب غير موجود أو معطّل" });
    }
    if (user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "غير مصرح لك بهذا الإجراء" });
    }
    req.user = user; // promote to full user object for downstream handlers
    next();
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// optionalAuth
//
// Attaches user if token exists, never blocks. Uses same lazy-fetch pattern.
// ─────────────────────────────────────────────────────────────────────────────
const optionalAuth = async (req, res, next) => {
  req.user = null;
  req.getUser = async () => null;

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return next();

  try {
    const token   = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = { _id: decoded.id, id: decoded.id };
    req.getUser = async () => {
      if (req._cachedUser) return req._cachedUser;
      req._cachedUser = await User.findById(decoded.id)
        .select("-password")
        .lean();
      return req._cachedUser;
    };
  } catch {
    // Invalid/expired token — treat as guest
    req.user = null;
  }

  next();
};

module.exports = { protect, adminOnly, optionalAuth };