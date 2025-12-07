import { Schema, model } from 'mongoose';
import { IWelcomeMessage } from '../interfaces';

const WelcomeMessageSchema = new Schema<IWelcomeMessage>(
  {
    message: { type: String, required: true },
  },
  { timestamps: true }
);

export default model<IWelcomeMessage>('WelcomeMessage', WelcomeMessageSchema);