import mongoose from "mongoose";
import logger from "../utils/logger.js";

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error("MONGODB_URI is not set in environment variables");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    logger.info(`MongoDB Atlas connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

export default connectDB;
