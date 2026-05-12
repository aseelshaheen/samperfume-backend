const express = require("express");
const router  = express.Router();
const nodemailer = require("nodemailer");
const { protect, adminOnly } = require("./../middleware/Auth");
const { getStats, getUsers, toggleUserActive } = require("../controllers/adminController");
const Order   = require("../models/Order");
const Perfume = require("../models/Perfume");

// ── Email transporter ──────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASS,
  },
});

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ── Stats ──────────────────────────────────────────────────────────────────────
router.get("/stats", getStats);

// ── Users ──────────────────────────────────────────────────────────────────────
router.get("/users",            getUsers);
router.put("/users/:id/toggle", toggleUserActive);

// ── Orders ─────────────────────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  try {
    const { page = 1, limit = 15, status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip   = (Number(page) - 1) * Number(limit);
    const total  = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate("user", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({ success: true, total, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
});

router.put("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status, ...(status === "delivered" ? { deliveredAt: new Date() } : {}) },
      { new: true }
    ).populate("user", "username email");

    if (!order) return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
});

// ── Reviews ────────────────────────────────────────────────────────────────────

// GET /api/admin/reviews?status=pending|approved|rejected
router.get("/reviews", async (req, res) => {
  try {
    const { status = "pending" } = req.query;

    const perfumes = await Perfume.find({ "reviews.0": { $exists: true } })
      .populate("reviews.user", "username email")
      .select("name reviews");

    let reviews = [];
    perfumes.forEach(p => {
      p.reviews.forEach(r => {
        const reviewStatus = r.status ?? "pending";
        if (reviewStatus === status) {
          reviews.push({
            _id:       r._id,
            user:      r.user,
            name:      r.name,
            rating:    r.rating,
            comment:   r.comment,
            title:     r.title ?? null,
            createdAt: r.createdAt,
            status:    reviewStatus,
            perfume:   { _id: p._id, name: p.name },
          });
        }
      });
    });

    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
});

// PUT /api/admin/reviews/:reviewId/approve
router.put("/reviews/:reviewId/approve", async (req, res) => {
  try {
    const perfume = await Perfume.findOne({ "reviews._id": req.params.reviewId })
      .populate("reviews.user", "username email");
    if (!perfume) return res.status(404).json({ success: false, message: "التقييم غير موجود" });

    const review = perfume.reviews.id(req.params.reviewId);
    review.status = "approved";
    await perfume.save();

    // Email notification to admin
    try {
      await transporter.sendMail({
        from:    `"متجر العطور" <${process.env.ADMIN_EMAIL}>`,
        to:      "samperfume8@gmail.com",
        subject: `✅ تمت الموافقة على تقييم — ${perfume.name}`,
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e8e2dc;border-radius:8px;overflow:hidden;">
            <div style="background:#452829;padding:20px 24px;">
              <h2 style="color:white;margin:0;font-size:18px;">✅ تمت الموافقة على تقييم</h2>
            </div>
            <div style="padding:24px;">
              <p style="margin:0 0 12px;color:#555;">تمت الموافقة على التقييم التالي ونشره:</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr><td style="padding:8px 0;color:#aaa;width:120px;">العطر</td><td style="color:#1a1a1a;font-weight:bold;">${perfume.name}</td></tr>
                <tr><td style="padding:8px 0;color:#aaa;">المستخدم</td><td style="color:#1a1a1a;">${review.user?.username ?? review.name} (${review.user?.email ?? "—"})</td></tr>
                <tr><td style="padding:8px 0;color:#aaa;">التقييم</td><td style="color:#452829;font-weight:bold;">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</td></tr>
                <tr><td style="padding:8px 0;color:#aaa;vertical-align:top;">التعليق</td><td style="color:#555;line-height:1.6;">${review.comment}</td></tr>
              </table>
            </div>
            <div style="background:#faf8f6;padding:14px 24px;text-align:center;font-size:12px;color:#aaa;">
              متجر العطور — لوحة الإدارة
            </div>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error("Email error (approve):", mailErr.message);
    }

    res.json({ success: true, message: "تمت الموافقة على التقييم" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
});

// PUT /api/admin/reviews/:reviewId/reject
router.put("/reviews/:reviewId/reject", async (req, res) => {
  try {
    const perfume = await Perfume.findOne({ "reviews._id": req.params.reviewId })
      .populate("reviews.user", "username email");
    if (!perfume) return res.status(404).json({ success: false, message: "التقييم غير موجود" });

    const review = perfume.reviews.id(req.params.reviewId);
    review.status = "rejected";
    await perfume.save();

    // Email notification to admin
    try {
      await transporter.sendMail({
        from:    `"متجر العطور" <${process.env.ADMIN_EMAIL}>`,
        to:      "samperfume8@gmail.com",
        subject: `❌ تم رفض تقييم — ${perfume.name}`,
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e8e2dc;border-radius:8px;overflow:hidden;">
            <div style="background:#c0392b;padding:20px 24px;">
              <h2 style="color:white;margin:0;font-size:18px;">❌ تم رفض تقييم</h2>
            </div>
            <div style="padding:24px;">
              <p style="margin:0 0 12px;color:#555;">تم رفض التقييم التالي وإخفاؤه:</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr><td style="padding:8px 0;color:#aaa;width:120px;">العطر</td><td style="color:#1a1a1a;font-weight:bold;">${perfume.name}</td></tr>
                <tr><td style="padding:8px 0;color:#aaa;">المستخدم</td><td style="color:#1a1a1a;">${review.user?.username ?? review.name} (${review.user?.email ?? "—"})</td></tr>
                <tr><td style="padding:8px 0;color:#aaa;">التقييم</td><td style="color:#c0392b;font-weight:bold;">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</td></tr>
                <tr><td style="padding:8px 0;color:#aaa;vertical-align:top;">التعليق</td><td style="color:#555;line-height:1.6;">${review.comment}</td></tr>
              </table>
            </div>
            <div style="background:#faf8f6;padding:14px 24px;text-align:center;font-size:12px;color:#aaa;">
              متجر العطور — لوحة الإدارة
            </div>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error("Email error (reject):", mailErr.message);
    }

    res.json({ success: true, message: "تم رفض التقييم" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
});

module.exports = router;