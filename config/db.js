const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // ── Connection pool ────────────────────────────────────────────────────
      // Default pool size is 5. With rapid sign-in/out, many parallel requests
      // (protect middleware, cart fetch, stats fetch, etc.) each waited for a
      // connection — pool exhausted → server hung.
      // Increase pool size so more requests can run concurrently.
      maxPoolSize: 20,       // up to 20 simultaneous connections
      minPoolSize: 2,        // keep 2 warm so first requests don't cold-start

      // ── Timeouts ──────────────────────────────────────────────────────────
      serverSelectionTimeoutMS: 5_000,  // fail fast if mongo unreachable
      socketTimeoutMS: 30_000,          // drop hung sockets after 30s
      connectTimeoutMS: 10_000,         // initial connect timeout
      heartbeatFrequencyMS: 10_000,     // check server health every 10s
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // ── Connection event handlers ──────────────────────────────────────────
    // Without these, a dropped connection silently kills all queries.
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected — will auto-reconnect");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected");
    });

  } catch (error) {
    console.error(`❌ MongoDB initial connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;