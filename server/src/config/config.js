const dotenv = require("dotenv");

dotenv.config();

const config = {
  port: process.env.PORT || 8000,
  host: process.env.HOST || "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN || `http://${process.env.HOST || "0.0.0.0"}:${process.env.PORT}`,
  allowedMethods: ["GET", "POST", "PUT", "DELETE"],
  transports: ["websocket", "polling"]
};

module.exports = config;
