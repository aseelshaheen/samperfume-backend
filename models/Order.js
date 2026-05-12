const mongoose = require("mongoose");

// ── Order Item sub-schema ─────────────────────────────────────────────────────
const orderItemSchema = new mongoose.Schema(
  {
    perfume:  { type: mongoose.Schema.Types.ObjectId, ref: "Perfume", required: true },
    name:     { type: String, required: true },
    brand:    { type: String, required: true },
    image:    { type: String },

    section:  {
      type: String,
      enum: ["full", "taqseem"],
      required: true,
    },

    size_ml:  { type: Number },   // null for full bottle

    quantity: { type: Number, required: true, min: 1 },
    price:    { type: Number, required: true },
  },
  { _id: true }
);

// ── Shipping address snapshot ─────────────────────────────────────────────────
const shippingAddressSchema = new mongoose.Schema(
  {
    city:   { type: String, required: true },
    area:   { type: String },
    street: { type: String },
    notes:  { type: String },
  },
  { _id: false }
);

// ── Main Order schema ─────────────────────────────────────────────────────────
const orderSchema = new mongoose.Schema(
  {
    // ── Who placed it (null for guests) ───────────────────────────────────────
    user: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,           // ← guests have no account
    },

    // ── Guest info (only set when user === null) ───────────────────────────────
    guestName:  { type: String },
    guestPhone: { type: String },

    // ── What was ordered ──────────────────────────────────────────────────────
    items: {
      type:     [orderItemSchema],
      required: true,
    },

    // ── Contact for this order ────────────────────────────────────────────────
    phone: {
      type:     String,
      required: true,
    },

    shippingAddress: {
      type:     shippingAddressSchema,
      required: true,
    },

    // ── Pricing breakdown ─────────────────────────────────────────────────────
    itemsPrice:    { type: Number, required: true },
    shippingPrice: { type: Number, required: true, default: 0 },
    discount:      { type: Number, default: 0 },
    totalPrice:    { type: Number, required: true },
    promoCode:     { type: String },

    // ── Payment ───────────────────────────────────────────────────────────────
    paymentMethod: {
      type:    String,
      enum:    ["cash_on_delivery", "online"],
      default: "cash_on_delivery",
    },

    isPaid:  { type: Boolean, default: false },
    paidAt:  { type: Date },

    // ── Fulfillment status ────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },

    adminNotes:   { type: String, select: false },
    deliveredAt:  { type: Date },
    cancelledAt:  { type: Date },
    cancelReason: { type: String },
  },
  {
    timestamps: true,
  }
);

// ── VIRTUAL: human-readable order number (e.g. "SP-00042") ───────────────────
orderSchema.virtual("orderNumber").get(function () {
  return `SP-${String(this._id).slice(-5).toUpperCase()}`;
});

module.exports = mongoose.model("Order", orderSchema);