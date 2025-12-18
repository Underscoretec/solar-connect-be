import * as mongoose from "mongoose";
import { ICommunication } from "../interfaces";

const Schema = mongoose.Schema;

const communicationSchema = new Schema<ICommunication>({
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'customers',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['email', 'whatsapp', 'telegram'],
    required: true
  },
  subject: {
    type: String,
    default: null
  },
  content: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'failed', 'pending'],
    default: 'draft'
  },
  sentBy: {
    type: Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  sentAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  errorMessage: {
    type: String,
    default: null
  }
}, { timestamps: true });

// Indexes for efficient queries
communicationSchema.index({ customerId: 1, createdAt: -1 });
communicationSchema.index({ type: 1, status: 1 });
communicationSchema.index({ sentBy: 1, createdAt: -1 });

export default mongoose.model<ICommunication>("communications", communicationSchema);

