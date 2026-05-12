const User = require("../models/User");
const Perfume = require("../models/Perfume");

// ══════════════════════════════════════════════════════════════
//  CART
// ══════════════════════════════════════════════════════════════

// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "cart.perfume",
      select: "name brand images availability fullBottle taqseem discount isActive",
    });
    res.json({ success: true, cart: user.cart });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// @route   POST /api/cart
// @access  Private
const addToCart = async (req, res) => {
  try {
    const { perfumeId, section, size, quantity = 1 } = req.body;

    // Validate perfume exists and is active
    const perfume = await Perfume.findById(perfumeId);
    if (!perfume || !perfume.isActive) {
      return res.status(404).json({ success: false, message: "العطر غير موجود" });
    }

    // Validate section matches availability
    if (section === "full" && perfume.availability === "taqseem_only") {
      return res.status(400).json({ success: false, message: "هذا العطر غير متاح كقارورة كاملة" });
    }
    if (section === "taqseem" && perfume.availability === "full_only") {
      return res.status(400).json({ success: false, message: "هذا العطر غير متاح كتقسيمة" });
    }

    const user = await User.findById(req.user._id);

    // Check if same item already in cart (same perfume + section + size)
    const existingIndex = user.cart.findIndex(
      (item) =>
        item.perfume.toString() === perfumeId &&
        item.section === section &&
        item.size === size
    );

    if (existingIndex >= 0) {
      // Increase quantity
      user.cart[existingIndex].quantity += quantity;
    } else {
      user.cart.push({ perfume: perfumeId, section, size, quantity });
    }

    await user.save();

    // Return populated cart
    const updated = await User.findById(req.user._id).populate({
      path: "cart.perfume",
      select: "name brand images availability fullBottle taqseem discount",
    });

    res.json({ success: true, cart: updated.cart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// @route   PUT /api/cart/:itemId
// @access  Private
const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const user = await User.findById(req.user._id);

    const item = user.cart.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "العنصر غير موجود في السلة" });
    }

    if (quantity <= 0) {
      // Remove item if quantity is 0
      user.cart.pull(req.params.itemId);
    } else {
      item.quantity = quantity;
    }

    await user.save();
    res.json({ success: true, cart: user.cart });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// @route   DELETE /api/cart/:itemId
// @access  Private
const removeFromCart = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.cart.pull(req.params.itemId);
    await user.save();
    res.json({ success: true, cart: user.cart });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// @route   DELETE /api/cart
// @access  Private
const clearCart = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { cart: [] });
    res.json({ success: true, message: "تم تفريغ السلة" });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ══════════════════════════════════════════════════════════════
//  WISHLIST
// ══════════════════════════════════════════════════════════════

// @route   GET /api/wishlist
// @access  Private
const getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "wishlist",
      "name brand images availability fullBottle taqseem discount rating reviewCount slug"
    );
    res.json({ success: true, wishlist: user.wishlist });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// @route   POST /api/wishlist/:perfumeId
// @access  Private
const toggleWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { perfumeId } = req.params;

    const index = user.wishlist.indexOf(perfumeId);
    let action;

    if (index >= 0) {
      user.wishlist.splice(index, 1); // remove
      action = "removed";
    } else {
      user.wishlist.push(perfumeId);  // add
      action = "added";
    }

    await user.save();
    res.json({ success: true, action, wishlist: user.wishlist });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

module.exports = {
  getCart, addToCart, updateCartItem, removeFromCart, clearCart,
  getWishlist, toggleWishlist,
};