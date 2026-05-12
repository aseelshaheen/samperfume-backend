const express = require("express");
const router  = express.Router();
const { protect, adminOnly } = require("./../middleware/Auth");
const {
  getPerfumes, getBrands, getPerfumeBySlug,
  createPerfume, updatePerfume, deletePerfume,
} = require("../controllers/perfumeController");

// Public
router.get("/",       getPerfumes);
router.get("/brands", getBrands);
router.get("/:slug",  getPerfumeBySlug);

// Admin only
router.post(  "/",    protect, adminOnly, createPerfume);
router.put(   "/:id", protect, adminOnly, updatePerfume);
router.delete("/:id", protect, adminOnly, deletePerfume);

// Add review (logged-in users)
router.post("/:id/reviews", protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || !comment)
      return res.status(400).json({ success: false, message: "التقييم والتعليق مطلوبان" });

    const perfume = await require("../models/Perfume").findById(req.params.id);
    if (!perfume) return res.status(404).json({ success: false, message: "العطر غير موجود" });


    perfume.reviews.push({
      user:    req.user._id,
      name:    req.user.username,
      rating:  Number(rating),
      comment,
      status:  "pending",   // always starts pending
    });

    perfume.recalcRating();
    await perfume.save();

    // Send email to admin about new pending review
    try {
      const nodemailer   = require("nodemailer");
      const transporter  = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.ADMIN_EMAIL, pass: process.env.ADMIN_EMAIL_PASS },
      });
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
                <tr><td style="padding:8px 0;color:#aaa;">المستخدم</td><td style="color:#1a1a1a;">${req.user.username} (${req.user.email})</td></tr>
                <tr><td style="padding:8px 0;color:#aaa;">التقييم</td><td style="color:#452829;font-weight:bold;">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</td></tr>
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
      console.error("Email error (new review):", mailErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
});

module.exports = router;