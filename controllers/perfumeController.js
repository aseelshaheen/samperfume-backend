const Perfume = require("../models/Perfume");

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/perfumes
// @access  Public
// Query params: search, brand, perfumeType, gender, fragranceFamily,
//              availability, sort, page, limit
// ─────────────────────────────────────────────────────────────────────────────
const getPerfumes = async (req, res) => {
  try {
const {
  search, brand, perfumeType, gender,
  fragranceFamily, availability, isFeatured,
  sort = "newest", page = 1, limit = 40,
} = req.query;

    const filter = { isActive: true };

    if (search) {
      filter.$text = { $search: search };
    }

    if (brand)           filter.brand          = { $regex: brand, $options: "i" };
    if (perfumeType)     filter.perfumeType     = perfumeType;
    if (gender)          filter.gender          = gender;
    if (fragranceFamily) filter.fragranceFamily = fragranceFamily;
    if (isFeatured === "true") filter.isFeatured = true;

    if (availability && availability !== "all") {
      filter.availability = availability;
    }

    let sortObj = {};
    if      (sort === "newest")     sortObj = { createdAt: -1 };
    else if (sort === "price_asc")  sortObj = { "fullBottle.price": 1 };
    else if (sort === "price_desc") sortObj = { "fullBottle.price": -1 };
    else if (sort === "rating")     sortObj = { rating: -1 };

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Perfume.countDocuments(filter);

    const perfumes = await Perfume.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(Number(limit))
      .select("-reviews");

    res.json({
      success: true,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      perfumes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/perfumes/brands
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const getBrands = async (req, res) => {
  try {
    const brands = await Perfume.distinct("brand", { isActive: true });
    res.json({ success: true, brands: brands.sort() });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/perfumes/:slug
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const getPerfumeBySlug = async (req, res) => {
  try {
    const perfume = await Perfume.findOne({
      slug:     req.params.slug,
      isActive: true,
    }).populate("reviews.user", "username avatar");

    if (!perfume) {
      return res.status(404).json({ success: false, message: "العطر غير موجود" });
    }

    // Convert to plain object so we can modify reviews safely
    const perfumeObj = perfume.toObject();

    // Only show approved reviews to customers
    perfumeObj.reviews = perfumeObj.reviews.filter(r => r.status === "approved");

    // Recalc rating based on approved reviews only
    if (perfumeObj.reviews.length > 0) {
      const total = perfumeObj.reviews.reduce((acc, r) => acc + r.rating, 0);
      perfumeObj.rating      = +(total / perfumeObj.reviews.length).toFixed(1);
      perfumeObj.reviewCount = perfumeObj.reviews.length;
    } else {
      perfumeObj.rating      = 0;
      perfumeObj.reviewCount = 0;
    }

    res.json({ success: true, perfume: perfumeObj });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/perfumes   (admin only)
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const createPerfume = async (req, res) => {
  try {
    // Remove slug from body — the pre-save hook always generates it
    const data = { ...req.body };
    delete data.slug;

    const perfume = await Perfume.create(data);
    res.status(201).json({ success: true, perfume });
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "يوجد عطر بنفس الاسم والبراند مسبقاً" });
    }
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/perfumes/:id  (admin only)
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const updatePerfume = async (req, res) => {
  try {
    // Remove slug from body — prevent manual override
    const data = { ...req.body };
    delete data.slug;

    const perfume = await Perfume.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    );
    if (!perfume) {
      return res.status(404).json({ success: false, message: "العطر غير موجود" });
    }
    res.json({ success: true, perfume });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/perfumes/:id  (admin only — soft delete)
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const deletePerfume = async (req, res) => {
  try {
    const perfume = await Perfume.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!perfume) {
      return res.status(404).json({ success: false, message: "العطر غير موجود" });
    }
    res.json({ success: true, message: "تم حذف العطر" });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

module.exports = {
  getPerfumes,
  getBrands,
  getPerfumeBySlug,
  createPerfume,
  updatePerfume,
  deletePerfume,
};