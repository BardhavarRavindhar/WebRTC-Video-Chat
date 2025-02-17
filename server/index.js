const express = require("express");
const http = require("http");
const cors = require("cors");
const { initializeSocket } = require("./src/utils/socketManager");
const logger = require("./src/config/logger");
const config = require("./src/config/config");

const PORT = config?.port

const app = express();
app.use(cors());

const server = http.createServer(app);

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Initialize Socket.io
initializeSocket(server);


server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));




















