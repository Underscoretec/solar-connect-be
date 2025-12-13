import * as mongoose from "mongoose";
import { ICustomer } from "../interfaces";
let Schema = mongoose.Schema;

const customerSchema = new Schema<ICustomer>({
    email: {
        type: String,
        default: null
    },
    profile: {
        type: Schema.Types.Mixed,
        default: null
    },
    attachments: {
        type: [{ type: Schema.Types.ObjectId, ref: 'attachments' }],
        default: []
    },
    meta: {
        type: Schema.Types.Mixed,
        default: null
    }
}, { timestamps: true });

// Compound index
customerSchema.index({ 'profile.email': 1, 'profile.phone': 1 });

export default mongoose.model<ICustomer>("customers", customerSchema);

