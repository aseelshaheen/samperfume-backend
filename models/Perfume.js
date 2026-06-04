const mongoose = require("mongoose");

// ── Review sub-schema ─────────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name:    { type: String, required: true },
    rating:  { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    status:  { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

// ── Taqseem size option sub-schema ────────────────────────────────────────────
const taqseemSizeSchema = new mongoose.Schema(
  {
    ml:    { type: Number, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
  },
  { _id: true }
);

// ── Main Perfume schema ───────────────────────────────────────────────────────
const perfumeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "اسم العطر مطلوب"],
      trim: true,
    },

    nameAr: {
      type: String,
      trim: true,
      default: "",
    },

    brand: {
      type: String,
      required: [true, "البراند مطلوب"],
      trim: true,
    },

    perfumeType: {
      type: String,
      required: true,
      enum: ["arabic", "western"],
    },

    gender: {
      type: String,
      enum: ["male", "female", "unisex"],
      required: true,
    },


fragranceFamily: {
  type: [String],
  enum: [
    "citrus","aquatic","green","fruity",
    "floral",
    "ambery","spicy","gourmand",
    "woody","mossy_woods","leather","fougere",
    "oud","musk","taif_rose",
    "other"
  ],
  default: [],
},

    description: {
      type: String,
      required: [true, "وصف العطر مطلوب"],
    },

    images: [
      {
        url:      { type: String, required: true },
        publicId: { type: String },
        isMain:   { type: Boolean, default: false },
      },
    ],

    availability: {
      type: String,
      required: true,
      enum: ["full_only", "taqseem_only", "both"],
    },

    fullBottle: {
      price:          { type: Number },
      wholesalePrice: { type: Number },   // ← سعر الجملة
      stock:          { type: Number, default: 0 },
      size_ml:        { type: Number },
      discountedPrice:  { type: Number },
    },

    taqseem: {
      sizes:           { type: [taqseemSizeSchema], default: [] },
      sourceBottle_ml: { type: Number },
    },

    slug: {
      type:      String,
      unique:    true,
      lowercase: true,
      trim:      true,
    },

    reviews:     { type: [reviewSchema], default: [] },
    rating:      { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },

    isActive:   { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },

    discount: {
      type:    Number,
      default: 0,
      min:     0,
      max:     100,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── VIRTUAL: discounted price for full bottle ─────────────────────────────────
perfumeSchema.virtual("fullBottle.finalPrice").get(function () {
  if (!this.fullBottle?.price) return null;
  if (!this.discount) return this.fullBottle.price;
  return +(this.fullBottle.price * (1 - this.discount / 100)).toFixed(2);
});

// ── HOOK: auto-generate slug ──────────────────────────────────────────────────
perfumeSchema.pre("save", async function () {
  if (this.isModified("name") || this.isModified("brand") || !this.slug) {
    const base = `${this.brand || ""}-${this.name || ""}`;
    this.slug = base
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u0600-\u06FF-]/g, "")
      .replace(/--+/g, "-")
      .trim();
  }
});

// ── METHOD: recalculate average rating ───────────────────────────────────────
perfumeSchema.methods.recalcRating = function () {
  if (this.reviews.length === 0) {
    this.rating = 0;
    this.reviewCount = 0;
  } else {
    const total = this.reviews.reduce((acc, r) => acc + r.rating, 0);
    this.rating = +(total / this.reviews.length).toFixed(1);
    this.reviewCount = this.reviews.length;
  }
};

// ── INDEXES ───────────────────────────────────────────────────────────────────
perfumeSchema.index({ name: "text", nameAr: "text", brand: "text", description: "text" });
perfumeSchema.index({ availability: 1 });
perfumeSchema.index({ perfumeType: 1 });
perfumeSchema.index({ gender: 1 });
perfumeSchema.index({ isActive: 1, isFeatured: 1 });

module.exports = mongoose.model("Perfume", perfumeSchema);
