import mongoose from 'mongoose';
import config from '../config';
import logger from '../services/logger';
import seedData from '../utils/seedData';

const connectDB = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.dbURL);

    logger.info('🛢️  MongoDB connected successfully');

    // Seed admin user after successful connection
    await seedData();
  } catch (error) {
    logger.error('Error connecting to MongoDB:', error);
    process.exit(1);  // Exit the process if connection fails
  }
};

export default connectDB;

