import { Server as SocketIOServer } from "socket.io";
import logger from "./logger";
import config from "../config/index";

let io: SocketIOServer;
const whitelist = JSON.parse(config.accessOrigin);

export default {
  init: (httpServer: any) => {
    io = new SocketIOServer(httpServer, {
      path: "/socket",
      transports: ["websocket", "polling"],
      allowUpgrades: true,
      cors: {
        origin: whitelist,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["my-custom-header"],
        credentials: true,
      },
    });

    io.on("connection", async (socket: any) => {
      const userId = socket.handshake.query.userId;
      const conversationId = socket.handshake.query.conversationId;

      logger.info(`Socket connection established: ${socket.id}, conversationId: ${conversationId}, userId: ${userId}`);

      try {
        if (userId) {
          socket.join(userId.toString());
          logger.info(`User ${userId} joined room via socket`);
        }
        if (conversationId) {
          // Join room with conv: prefix to match emit pattern
          const roomName = `conv:${conversationId}`;
          socket.join(roomName);
          logger.info(`Socket ${socket.id} joined room: ${roomName}`);
        }
        if (!userId && !conversationId) {
          logger.error("Socket connected without userId or conversationId");
        }
      } catch (err) {
        logger.error(`Error joining socket room: ${err}`);
      }

      // Handle join_conversation event for manual room joining
      socket.on('join_conversation', (convId: string) => {
        const roomName = `conv:${convId}`;
        socket.join(roomName);
        logger.info(`Socket ${socket.id} manually joined room: ${roomName}`);
      });

      socket.on("disconnect", (reason: string) => {
        logger.info(`Socket ${socket.id} disconnected. Reason: ${reason}. ConvId: ${conversationId || 'none'}`);
      });

      socket.on("error", (error: any) => {
        logger.error(`Socket ${socket.id} error: ${error}`);
      });
    });

    return io;
  },

  get: () => {
    if (!io) {
      throw new Error("Socket.IO not initialized");
    }
    return io;
  },
};

