import * as mongoose from "mongoose";
import { IAttachment } from "../interfaces";
let Schema = mongoose.Schema;

const attachmentSchema = new Schema<IAttachment>({
  url: {
    type: String,
    required: true
  },
  key: {
    type: String
  },
  filename: {
    type: String
  },
  type: {
    type: String,
    required: true,
    enum: ['site_photo', 'roof_photo', 'angle_photo', 'other']
  },
  mimeType: {
    type: String
  },
  size: {
    type: Number
  },
}, { timestamps: true });

export default mongoose.model<IAttachment>("attachments", attachmentSchema);

