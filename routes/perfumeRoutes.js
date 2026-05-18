const express = require("express");
const router  = express.Router();
const { protect, adminOnly } = require("./../middleware/Auth");
const {
  getPerfumes, getBrands, getPerfumeBySlug,
  createPerfume, updatePerfume, deletePerfume,
} = require("../controllers/perfumeController");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/",       getPerfumes);
router.get("/brands", getBrands);
router.get("/:slug",  getPerfumeBySlug);

// ── Admin only ────────────────────────────────────────────────────────────────
router.post(  "/",    protect, adminOnly, createPerfume);
router.put(   "/:id", protect, adminOnly, updatePerfume);
router.delete("/:id", protect, adminOnly, deletePerfume);

// ── Add review (logged-in users) ──────────────────────────────────────────────
router.post("/:id/reviews", protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    // ── Validate input ──
    if (!rating || !comment) {
      return res.status(400).json({ success: false, message: "التقييم والتعليق مطلوبان" });
    }

    // ── req.user guard: protect middleware must have populated this ──
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "يجب تسجيل الدخول أولاً" });
    }

    const Perfume = require("../models/Perfume");
    const perfume = await Perfume.findById(req.params.id);
    if (!perfume) {
      return res.status(404).json({ success: false, message: "العطر غير موجود" });
    }

    // ── Build the review object safely (no undefined fields) ──
    const reviewData = {
      user:    req.user._id,
      name:    req.user.username || req.user.name || "مستخدم",
      rating:  Number(rating),
      comment: String(comment).trim(),
      status:  "pending",
    };

    perfume.reviews.push(reviewData);
    perfume.recalcRating();
    await perfume.save();

    // ── Email notification (non-blocking — never crashes the response) ──
    setImmediate(async () => {
      try {
        const nodemailer  = require("nodemailer");
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.ADMIN_EMAIL,
            pass: process.env.ADMIN_EMAIL_PASS,
          },
        });

        const stars    = "★".repeat(Number(rating)) + "☆".repeat(5 - Number(rating));
        const userEmail = req.user.email || "—";
        const userName  = req.user.username || req.user.name || "مستخدم";

        await transporter.sendMail({
          from:    `"متجر العطور" <${process.env.ADMIN_EMAIL}>`,
          to:      "samperfume8@gmail.com",
          subject: `🌟 تقييم جديد بانتظار المراجعة — ${perfume.name}`,
          html: `
            <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e8e2dc;border-radius:8px;overflow:hidden;">
              <div style="background:#452829;padding:20px 24px;">
                <h2 style="color:white;margin:0;font-size:18px;">🌟 تقييم جديد بانتظار موافقتك</h2>
              </div>
              <div style="padding:24px;">
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                  <tr><td style="padding:8px 0;color:#aaa;width:120px;">العطر</td><td style="color:#1a1a1a;font-weight:bold;">${perfume.name}</td></tr>
                  <tr><td style="padding:8px 0;color:#aaa;">المستخدم</td><td style="color:#1a1a1a;">${userName} (${userEmail})</td></tr>
                  <tr><td style="padding:8px 0;color:#aaa;">التقييم</td><td style="color:#452829;font-weight:bold;">${stars}</td></tr>
                  <tr><td style="padding:8px 0;color:#aaa;vertical-align:top;">التعليق</td><td style="color:#555;line-height:1.6;">${comment}</td></tr>
                </table>
                <div style="margin-top:20px;padding:14px;background:#faf8f6;border-radius:6px;text-align:center;">
                  <p style="margin:0;font-size:13px;color:#888;">سجّل دخولك للوحة الإدارة للموافقة أو رفض هذا التقييم</p>
                </div>
              </div>
              <div style="background:#faf8f6;padding:14px 24px;text-align:center;font-size:12px;color:#aaa;">
                متجر العطور — لوحة الإدارة
              </div>
            </div>
          `,
        });
      } catch (mailErr) {
        // Email failure must NEVER affect the API response
        console.error("Email error (new review):", mailErr.message);
      }
    });

    res.json({ success: true, message: "تم إرسال تقييمك بنجاح وسيظهر بعد المراجعة" });

  } catch (err) {
    // Log the full error so you can see exactly what's crashing
    console.error("Review POST error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "خطأ في الخادم",
    });
  }
});

module.exports = router;
