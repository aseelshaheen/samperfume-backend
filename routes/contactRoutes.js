const express  = require("express");
const router   = express.Router();
const nodemailer = require("nodemailer");

router.post("/", async (req, res) => {
  const { name, phone, email, subject, message } = req.body;

  if (!name?.trim() || !message?.trim()) {
    return res.status(400).json({ success: false, message: "الاسم والرسالة مطلوبان" });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,   // samperfume8@gmail.com
      pass: process.env.MAIL_PASS,   // App Password (see step 3)
    },
  });

  const subjectMap = {
    order: "استفسار عن طلب", product: "استفسار عن منتج",
    return: "إرجاع أو استبدال", custom: "طلب خاص / تخصيص", other: "موضوع آخر",
  };

  await transporter.sendMail({
    from: `"SAM Perfume Contact" <${process.env.MAIL_USER}>`,
    to:   process.env.MAIL_USER,   // sends to yourself
    replyTo: email || process.env.MAIL_USER,
    subject: `[تواصل معنا] ${subjectMap[subject] || "رسالة جديدة"} — ${name}`,
    html: `
      <div dir="rtl" style="font-family:Arial;max-width:600px;margin:auto">
        <h2 style="color:#452829">رسالة جديدة من موقع SAM Perfume</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;background:#faf8f6;font-weight:bold">الاسم</td><td style="padding:8px">${name}</td></tr>
          <tr><td style="padding:8px;background:#faf8f6;font-weight:bold">الهاتف</td><td style="padding:8px">${phone || "—"}</td></tr>
          <tr><td style="padding:8px;background:#faf8f6;font-weight:bold">البريد</td><td style="padding:8px">${email || "—"}</td></tr>
          <tr><td style="padding:8px;background:#faf8f6;font-weight:bold">الموضوع</td><td style="padding:8px">${subjectMap[subject] || "—"}</td></tr>
          <tr><td style="padding:8px;background:#faf8f6;font-weight:bold">الرسالة</td><td style="padding:8px">${message}</td></tr>
        </table>
      </div>
    `,
  });

  res.json({ success: true, message: "تم الإرسال بنجاح" });
});

module.exports = router;