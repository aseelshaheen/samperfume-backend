const Order = require("../models/Order");
const User  = require("../models/User");

// ─────────────────────────────────────────────────────────────────────────────
// Create guest order
// ─────────────────────────────────────────────────────────────────────────────
const createGuestOrder = async (req, res) => {
  try {
    const {
      guestName, guestPhone, guestCity, notes,
      items, itemsPrice, shippingPrice, discount, totalPrice,
      promoCode, paymentMethod,
    } = req.body;

    if (!guestName?.trim())
      return res.status(400).json({ success: false, message: "الاسم مطلوب" });

    if (!guestPhone?.trim())
      return res.status(400).json({ success: false, message: "رقم الهاتف مطلوب" });

    if (!guestCity?.trim())
      return res.status(400).json({ success: false, message: "المدينة مطلوبة" });

    if (!items?.length)
      return res.status(400).json({ success: false, message: "الطلب فارغ" });

    const orderItems = items.map((item) => ({
      perfume:  item.perfumeId,
      name:     item.name  ?? "—",
      brand:    item.brand ?? "—",
      image:    item.image ?? null,
      section:  item.section,
      size_ml:  item.section === "taqseem" ? (item.size ?? null) : null,
      quantity: item.quantity,
      price:    item.price,
    }));

    const order = await Order.create({
      user: null,
      guestName:  guestName.trim(),
      guestPhone: guestPhone.trim(),
      items: orderItems,
      phone: guestPhone.trim(),
      shippingAddress: {
        city: guestCity.trim(),
        notes: notes?.trim() ?? "",
      },
      itemsPrice,
      shippingPrice: shippingPrice ?? 0,
      discount: discount ?? 0,
      totalPrice,
      promoCode: promoCode ?? null,
      paymentMethod: paymentMethod ?? "cash_on_delivery",
    });

    res.status(201).json({ success: true, order });

  } catch (err) {
    console.error("Guest order error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Create authenticated order
// ─────────────────────────────────────────────────────────────────────────────
const createAuthOrder = async (req, res) => {
  try {
    const {
      items, phone, shippingAddress,
      itemsPrice, shippingPrice, discount, totalPrice,
      promoCode, paymentMethod,
      updateProfile, newAddress, addressLabel, setAsDefault,
    } = req.body;

    if (!items?.length)
      return res.status(400).json({ success: false, message: "الطلب فارغ" });

    if (!phone)
      return res.status(400).json({ success: false, message: "رقم الهاتف مطلوب" });

    if (!shippingAddress?.city)
      return res.status(400).json({ success: false, message: "عنوان التوصيل مطلوب" });

    const order = await Order.create({
      user: req.user._id,
      items,
      phone,
      shippingAddress,
      itemsPrice,
      shippingPrice: shippingPrice ?? 0,
      discount: discount ?? 0,
      totalPrice,
      promoCode: promoCode ?? null,
      paymentMethod: paymentMethod ?? "cash_on_delivery",
    });

    // تحديث بيانات المستخدم
    if (updateProfile) {
      const user = await User.findById(req.user._id);

      if (phone) user.phone = phone.trim();

      if (newAddress && shippingAddress?.city) {
        const addrExists = user.addresses.some(
          (a) =>
            a.city === shippingAddress.city &&
            a.area === (shippingAddress.area ?? "") &&
            a.street === (shippingAddress.street ?? "")
        );

        if (!addrExists) {
          if (setAsDefault) {
            user.addresses.forEach((a) => (a.isDefault = false));
          }

          user.addresses.push({
            label: addressLabel ?? "العنوان الجديد",
            city: shippingAddress.city,
            area: shippingAddress.area ?? "",
            street: shippingAddress.street ?? "",
            notes: shippingAddress.notes ?? "",
            isDefault: !!setAsDefault,
          });
        }
      }

      await user.save();
    }

    // تفريغ السلة
    await User.findByIdAndUpdate(req.user._id, { cart: [] });

    res.status(201).json({ success: true, order });

  } catch (err) {
    console.error("Auth order error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get user orders
// ─────────────────────────────────────────────────────────────────────────────
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select("-adminNotes");

    res.json({ success: true, orders });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

module.exports = {
  createGuestOrder,
  createAuthOrder,
  getMyOrders,
};