import * as mongoose from "mongoose";
import { IConversationSummary } from "../interfaces";
let Schema = mongoose.Schema;

const conversationSummarySchema = new Schema<IConversationSummary>({
    conversationId: {
        type: Schema.Types.ObjectId,
        ref: 'conversations',
        required: true,
        index: true
    },
    summaryText: {
        type: String
    },
    tokensUsed: {
        type: Number,
        default: 0
    },
    cost: {
        type: Number,
        default: 0
    },
    meta: {
        type: Schema.Types.Mixed
    }
}, { timestamps: true });

conversationSummarySchema.index({ conversationId: 1, generatedAt: -1 });

export default mongoose.model<IConversationSummary>("conversationsummaries", conversationSummarySchema);

