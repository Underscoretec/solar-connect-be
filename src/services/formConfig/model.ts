import { Schema, model } from 'mongoose';
import { IFormConfig } from '../interfaces';

const FormConfigSchema = new Schema<IFormConfig>(
  {
    title: { type: String, required: true },
    welcomeMessage: { type: String, required: true },
    locale: { type: String, required: true },
    description: { type: String, required: true },
    formJson: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<IFormConfig>('FormConfig', FormConfigSchema);