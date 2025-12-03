import * as mongoose from "mongoose";
import { IConversation, IMessage } from "../interfaces";
let Schema = mongoose.Schema;

const messageSchema = new Schema<IMessage>({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  text: {
    type: String,
    trim: true
  },
  payload: {
    type: Schema.Types.Mixed
  },
  attachments: {
    type: [{ type: Schema.Types.ObjectId, ref: 'attachments' }],
    default: []
  },
  questionId: {
    type: String
  },
  createdByAdmin: {
    type: Schema.Types.ObjectId,
    ref: 'users'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const conversationSchema = new Schema<IConversation>({
  sessionId: {
    type: String
  },
  visitorFingerprint: {
    type: String,
    index: true
  },
  ip: {
    type: String,
    select: false
  },
  userAgent: {
    type: String,
    select: false
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'customers'
  },
  messages: {
    type: [messageSchema],
    default: []
  },
  llm: {
    model: String,
    temperature: Number,
    tokensPrompt: Number,
    tokensCompletion: Number,
    tokensTotal: Number,
    cost: {
      type: Number,
      default: 0
    },
    meta: Schema.Types.Mixed
  },
  messageCount: {
    type: Number,
    default: 0
  },
  fileStats: {
    totalUploads: {
      type: Number,
      default: 0
    },
    uploadedTypes: [String]
  },
  summaryId: {
    type: Schema.Types.ObjectId,
    ref: 'conversationsummaries'
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'followup'],
    default: 'open'
  },
  meta: {
    type: Schema.Types.Mixed,
    default: null
  }
}, { timestamps: true });

// Indexes
conversationSchema.index({ sessionId: 1 });
conversationSchema.index({ customerId: 1, createdAt: -1 });
conversationSchema.index({ 'messages.questionId': 1 });

export default mongoose.model<IConversation>("conversations", conversationSchema);

