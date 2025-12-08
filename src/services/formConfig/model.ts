import { Schema, model } from 'mongoose';
import { IFormConfig } from '../interfaces';


const FormConfigSchema = new Schema<IFormConfig>(
  {
    name: { type: String, required: true },
    welcomeMessage: { type: String, required: true },
    slug: { type: String, required: true, unique: true, default: 'solar-onboarding-v1' },
    description: { type: String },
    version: { type: Number, default: 1 },
    formJson: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Compound index
FormConfigSchema.index({ slug: 1 });
export default model<IFormConfig>('FormConfig', FormConfigSchema);