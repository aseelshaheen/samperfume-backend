const User    = require("../models/User");
const Perfume = require("../models/Perfume");
const Order   = require("../models/Order");

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/admin/stats
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newUsersToday,
      totalOrders,
      totalPerfumes,
      activePerfumes,
      ordersByStatusRaw,
      revenueRaw,
    ] = await Promise.all([
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "customer", createdAt: { $gte: today } }),
      Order.countDocuments(),
      Perfume.countDocuments(),
      Perfume.countDocuments({ isActive: true }),

      // Count orders grouped by status
      Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),

      // Sum revenue from delivered orders
      Order.aggregate([
        { $match: { status: "delivered" } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } }
      ]),
    ]);

    // Map status counts to object
    const ordersByStatus = {};
    ordersByStatusRaw.forEach(({ _id, count }) => { ordersByStatus[_id] = count; });

    const pendingOrders  = ordersByStatus.pending  ?? 0;
    const totalRevenue   = revenueRaw[0]?.total     ?? 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        newUsersToday,
        totalOrders,
        pendingOrders,
        totalPerfumes,
        activePerfumes,
        ordersByStatus,
        totalRevenue,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/admin/users
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email:    { $regex: search, $options: "i" } },
      ];
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select("-password -resetPasswordToken -resetPasswordExpire");

    // Attach order count per user
    const userIds   = users.map(u => u._id);
    const orderCounts = await Order.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: "$user", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    orderCounts.forEach(({ _id, count }) => { countMap[_id.toString()] = count; });

    const enriched = users.map(u => ({
      ...u.toObject(),
      orderCount: countMap[u._id.toString()] ?? 0,
    }));

    res.json({ success: true, total, users: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/admin/users/:id/toggle
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    if (user.role === "admin") return res.status(400).json({ success: false, message: "لا يمكن تعطيل حساب مدير" });

    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

module.exports = { getStats, getUsers, toggleUserActive };