import winston from 'winston';
import 'winston-daily-rotate-file';
const { combine, timestamp, printf, colorize, align } = winston.format;

const transport = new winston.transports.DailyRotateFile({
  filename: 'logs/SolarConnect-%DATE%.log', // File naming pattern, %DATE% is replaced by actual date
  datePattern: 'YYYY-MM-DD', // Date format to be used in filenames
  zippedArchive: true, // Compress archived logs (e.g., into .gz files)
  maxSize: '20m', // Maximum file size before rotation (e.g., 20 MB)
  maxFiles: '14d', // Keep logs for 14 days before auto-deleting
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    colorize({ all: true }),
    timestamp({
      format: 'YYYY-MM-DD hh:mm:ss.SSS A',
    }),
    align(),
    printf((info: any) => `[${info.timestamp}] ${info.level}:${info.level === "error" ? "❌  " + info.message : info.message}`)
  ),
  transports: [
    transport, // Adds the daily log rotation transport
    new winston.transports.Console(), // Optionally log to the console as well
  ],
});

export default logger;

