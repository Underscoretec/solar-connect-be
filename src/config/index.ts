import dotenv from "dotenv";
const envFound = dotenv.config();

if (envFound.error) {
  // This error should crash whole process
  console.log("⚠️  Couldn't find .env file  ⚠️");
  setTimeout(() => {
    process.exit(1);
  }, 2000);
}

const PORT: number = parseInt(process.env.PORT as string, 10);
const MONGODB_URI: string = process.env.MONGODB_URI as string;
const EXPIRES: string = process.env.JWT_EXPIRY_IN as string;
const TOKEN_SEC: string = process.env.JWT_PRIVATE_KEY as string;
const ACCESS_ORIGIN: any = process.env.ACCESS_ORIGIN as any;
const GEMINI_API_KEY: string = process.env.GEMINI_API_KEY as string;
const GEMINI_MODEL: string = process.env.GEMINI_MODEL as string;
const DEFAULT_DATA_PER_PAGE: number = parseInt(process.env.DEFAULT_DATA_PER_PAGE as string, 25);
const SOCKET_PORT: number = parseInt(process.env.SOCKET_PORT as string, 10)
const ADMIN_EMAIL: string = process.env.ADMIN_EMAIL as string;
const ADMIN_PASSWORD: string = process.env.ADMIN_PASSWORD as string;
const ADMIN_NAME: string = process.env.ADMIN_NAME as string;
const ADMIN_ROLE: string = process.env.ADMIN_ROLE as string;


export default {
  port: PORT || 8022,
  dbURL: MONGODB_URI || 'mongodb://localhost:27017/solar-connect',
  tokenSecret: TOKEN_SEC,
  jwtExpires: EXPIRES,
  accessOrigin: ACCESS_ORIGIN,
  geminiApiKey: GEMINI_API_KEY,
  geminiModel: GEMINI_MODEL,
  defaultDataPerPage: DEFAULT_DATA_PER_PAGE,
  socket_port: SOCKET_PORT || 7772,
  adminEmail: ADMIN_EMAIL,
  adminPassword: ADMIN_PASSWORD,
  adminName: ADMIN_NAME,
  adminRole: ADMIN_ROLE || "admin",
  api: {
    prefix: "/api",
  },
};

