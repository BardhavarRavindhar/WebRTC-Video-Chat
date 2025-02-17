const { Server } = require("socket.io");
const logger = require("../config/logger");
const config = require("../config/config");


const connectedUsers = new Map();
const socketToUser = new Map();

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: config?.corsOrigin,
      methods: config?.allowedMethods,
    },
    transports: config?.transports,
  });

  io.on("connection", (socket) => {
    logger.info(`[CONNECTED] Socket ID: ${socket.id}`);

    socket.on("register", ({ userId, userName }) => {
      connectedUsers.set(userId, { userId, userName, socketId: socket.id });
      socketToUser.set(socket.id, userId);
      logger.info(`[REGISTER] ${userName} (${userId})`);
      io.emit("user-list", Array.from(connectedUsers.values()));
    });

    socket.on("offer", ({ offer, to }) => {
      const senderId = socketToUser.get(socket.id);
      const recipient = connectedUsers.get(to);
      if (recipient && senderId) {
        logger.info(`[OFFER] ${senderId} → ${recipient.userId}`);
        io.to(recipient.socketId).emit("offer", { offer, from: senderId });
      }
    });

    socket.on("answer", ({ answer, to }) => {
      const senderId = socketToUser.get(socket.id);
      const recipient = connectedUsers.get(to);
      if (recipient && senderId) {
        logger.info(`[ANSWER] ${senderId} → ${recipient.userId}`);
        io.to(recipient.socketId).emit("answer", { answer });
      }
    });

    socket.on("ice-candidate", ({ candidate, to }) => {
      const senderId = socketToUser.get(socket.id);
      const recipient = connectedUsers.get(to);
      if (recipient && senderId) {
        logger.info(`[ICE CANDIDATE] ${senderId} → ${recipient.userId}`);
        io.to(recipient.socketId).emit("ice-candidate", { candidate });
      }
    });

    socket.on("disconnect", () => {
      const userId = socketToUser.get(socket.id);
      if (userId) {
        logger.info(`[DISCONNECTED] ${userId}`);
        connectedUsers.delete(userId);
        socketToUser.delete(socket.id);
        io.emit("user-list", Array.from(connectedUsers.values()));
      }
    });
  });
}

module.exports = { initializeSocket };
