const express = require("express");
const router  = express.Router();

const { protect } = require("../middleware/Auth");

// ✅ IMPORT CONTROLLER FUNCTIONS
const {
  createGuestOrder,
  createAuthOrder,
  getMyOrders,
} = require("../controllers/orderController");

// ✅ USE THEM
router.post("/guest", createGuestOrder);
router.post("/", protect, createAuthOrder);
router.get("/mine", protect, getMyOrders);

module.exports = router;