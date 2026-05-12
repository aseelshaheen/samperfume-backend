const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ── Address sub-schema ────────────────────────────────────────────────────────
const addressSchema = new mongoose.Schema(
  {
    label:    { type: String, default: "الرئيسي" },
    city:     { type: String, required: true },
    area:     { type: String },
    street:   { type: String },
    notes:    { type: String },
    isDefault:{ type: Boolean, default: false },
  },
  { _id: true }
);

// ── Main User schema ──────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "البريد الإلكتروني مطلوب"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "صيغة البريد الإلكتروني غير صحيحة",
      ],
    },

    password: {
      type: String,
      required: [true, "كلمة المرور مطلوبة"],
      minlength: [6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"],
      select: false,
    },

    username: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    avatar: {
      type: String,
      default: null,
    },

    addresses: {
      type: [addressSchema],
      default: [],
    },

    role: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer",
    },

    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Perfume",
      },
    ],

    cart: [
      {
        perfume:  { type: mongoose.Schema.Types.ObjectId, ref: "Perfume", required: true },
        section:  { type: String, enum: ["full", "taqseem"], required: true },
        size:     { type: Number },
        quantity: { type: Number, required: true, min: 1, default: 1 },
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    resetPasswordToken:  { type: String, select: false },
    resetPasswordExpire: { type: Date,   select: false },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function () {
  // Auto-generate username from email if not set yet
  if (!this.username && this.email) {
    this.username = this.email.split("@")[0];
  }

  // Only hash password if it was actually modified
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── METHODS ───────────────────────────────────────────────────────────────────
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);