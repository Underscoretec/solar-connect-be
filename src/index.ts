import express from 'express';
import path from 'path';
import config from './config';
import connectDB from './database';
import logger from './services/logger';
import createArtUsingServerName from './utils/createArtUsingServerName';
import routes from './routes/routes';
import Helmet from "helmet";
import cors from "cors";
import socketConnection from "./services/io";

const app = express();

const whitelist = JSON.parse(config.accessOrigin);

// Configure Helmet to allow WebSocket connections
app.use(Helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: whitelist, credentials: true }));
app.use(express.json({
  limit: '50mb',
  verify: (req: any, res: any, buf: Buffer) => {
    if (buf && buf.length) {
      req.rawBody = buf.toString("utf8");
    } else logger.info(`Buffer data is empty Buf: ${JSON.stringify(buf)}`)
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from public directory with CORS headers
app.use('/uploads', (req, res, next) => {
  // Set CORS headers for static file requests
  const origin = req.headers.origin;
  if (origin && whitelist.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (whitelist.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Allow cross-origin resource loading
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.use(express.static(path.join(process.cwd(), 'public')));

// Database connection function
connectDB();

app.use("/api", routes);

createArtUsingServerName("Solar Connect Server");

const server = app.listen(config.port, () => {
  logger.info(`
      ################################################
      🛡️  Solar Connect server listening on port: http://localhost:${config.port} 🛡️
      ################################################
    `);
});

// Initialize socket here
const io = socketConnection.init(server);

logger.info(`
  ################################################
  🔌 Socket.IO server initialized on path: /socket
  ################################################
`);

