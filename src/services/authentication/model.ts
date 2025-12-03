import * as mongoose from "mongoose";
import { User } from "../interfaces";
let Schema = mongoose.Schema;

const usersSchema = new Schema<User>({
  name: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
  },
  role: {
    type: String,
    enum: ["user", "admin", "subAdmin", "superAdmin"],
    default: "admin"
  },
  enabled: {
    type: Number,
    default: 1, //0:delete, 1:enabled, 2:disabled
  },
  isVerified: {
    type: Number,
    default: 1,
    min: 0,
    max: 1
  },
  createdAt: {
    type: Number,
    default: Date.now,
  },
  updatedAt: {
    type: Number,
    default: Date.now,
  },
});

export default mongoose.model<User>("users", usersSchema);

