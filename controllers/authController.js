const jwt    = require("jsonwebtoken");
const User   = require("../models/User");

// ── Helper: sign JWT ──────────────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });

// ── Helper: send token response ───────────────────────────────────────────────
const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;
  res.status(statusCode).json({ success: true, token, user });
};

// ─────────────────────────────────────────────────────────────────────────────
// Simple in-memory rate limiter for login attempts.
// Prevents bcrypt from being hammered (each compare is CPU-intensive).
// Key = IP address. Allows 10 attempts per minute then blocks for 60s.
// ─────────────────────────────────────────────────────────────────────────────
const loginAttempts = new Map();

const checkLoginRateLimit = (ip) => {
  const now  = Date.now();
  const data = loginAttempts.get(ip) || { count: 0, resetAt: now + 60_000 };

  // Reset window if expired
  if (now > data.resetAt) {
    data.count   = 0;
    data.resetAt = now + 60_000;
  }

  data.count++;
  loginAttempts.set(ip, data);

  if (data.count > 10) {
    const waitSec = Math.ceil((data.resetAt - now) / 1000);
    return waitSec; // returns seconds to wait; 0 = allowed
  }
  return 0;
};

// Clean up old entries every 5 minutes so the Map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of loginAttempts.entries()) {
    if (now > val.resetAt) loginAttempts.delete(key);
  }
}, 5 * 60_000);

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/register
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني وكلمة المرور مطلوبان",
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
      .lean(); // lean() — no mongoose document overhead, just a plain object
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني مسجّل مسبقاً",
      });
    }

    const user = await User.create({ email, password });
    sendToken(user, 201, res);
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    console.error("register error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    // Rate-limit by IP to prevent bcrypt pile-up
    const ip      = req.ip || req.connection.remoteAddress || "unknown";
    const waitSec = checkLoginRateLimit(ip);
    if (waitSec > 0) {
      return res.status(429).json({
        success: false,
        message: `محاولات كثيرة جداً، انتظر ${waitSec} ثانية`,
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني وكلمة المرور مطلوبان",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "هذا الحساب معطّل، تواصل مع الدعم",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      });
    }

    sendToken(user, 200, res);
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/auth/me
// @access  Private
//
// FIX: was doing User.findById() again even though protect middleware already
// has the user info. Now uses req.getUser() which caches the result so only
// one DB query happens per request even if called multiple times.
// ─────────────────────────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await req.getUser();

    if (!user) {
      return res.status(401).json({ success: false, message: "المستخدم غير موجود" });
    }

    // Populate wishlist separately only when needed — avoids always joining
    // the perfumes collection on every /me call (e.g. navbar cart refresh)
    const populated = await User.findById(user._id)
      .select("-password")
      .populate("wishlist", "name brand images availability")
      .lean();

    res.json({ success: true, user: populated });
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/auth/update-profile
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { username, phone } = req.body;

    // findByIdAndUpdate is one round-trip vs findById + save (two round-trips)
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        ...(username && { username: username.trim() }),
        ...(phone    && { phone:    phone.trim()    }),
      },
      { new: true, runValidators: true, select: "-password" }
    ).lean();

    res.json({ success: true, user });
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    console.error("updateProfile error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/auth/change-password
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "جميع الحقول مطلوبة" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل",
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "كلمة المرور الحالية غير صحيحة" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/address
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const addAddress = async (req, res) => {
  try {
    const { label, city, area, street, notes, isDefault } = req.body;

    if (!city) {
      return res.status(400).json({ success: false, message: "المدينة مطلوبة" });
    }

    const user = await User.findById(req.user._id);

    if (isDefault) {
      user.addresses.forEach((a) => (a.isDefault = false));
    }

    user.addresses.push({ label, city, area, street, notes, isDefault: !!isDefault });
    await user.save();

    res.status(201).json({ success: true, addresses: user.addresses });
  } catch (err) {
    console.error("addAddress error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/auth/address/:addressId
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const deleteAddress = async (req, res) => {
  try {
    // $pull is a single atomic DB operation — no need to load + filter + save
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { addresses: { _id: req.params.addressId } } },
      { new: true, select: "-password" }
    ).lean();

    res.json({ success: true, addresses: user.addresses });
  } catch (err) {
    console.error("deleteAddress error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  addAddress,
  deleteAddress,
};