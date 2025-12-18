import { Types, Document as MongooseDocument } from "mongoose";
import { Request, Response } from "express";
import { JwtPayload } from 'jsonwebtoken';

// ============================================================================
// Request/Response Interfaces
// ============================================================================

export interface header {
  authorization?: string;
}

export interface request extends Request {
  user?: User;
  files?: any;
  file?: Express.Multer.File;
}

export interface response extends Response {
  statusCode: number;
  error: boolean;
  code: string;
  result?: resultType;
  message: string;
  dataCount?: number;
  avg?: number;
  token?: string;
  expiresAt?: Date | undefined;
}

export class ErrorType extends Error {
  code?: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    this.name = 'ErrorType';
  }
}

export interface ValidationError {
  msg: string;
  param: string;
  location: string;
  message?: string;
}

export interface Payload {
  id: Types.ObjectId;
  deviceId?: string;
}

export interface tokenObject {
  token: string;
  expiresAt: Date;
}

export interface DecodeTokenPayload extends JwtPayload {
  id: Types.ObjectId;
  deviceId: string;
}

// ============================================================================
// Customer Types
// ============================================================================

export interface ICustomer extends MongooseDocument {
  _id: Types.ObjectId;
  email?: string;
  fullName?: string;
  profile?: Record<string, any>;
  attachments?: Types.ObjectId[];
  communications?: Types.ObjectId[];
  meta?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// Message Types
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface IMessage {
  _id?: Types.ObjectId;
  role: MessageRole;
  text?: string;
  payload?: Record<string, any>;
  attachments?: Types.ObjectId[];
  questionId?: string | null;
  createdByAdmin?: Types.ObjectId;
  createdAt?: Date;
}

// ============================================================================
// Conversation Types
// ============================================================================

export type ConversationStatus = 'open' | 'closed' | 'followup';

export interface ILLMStats {
  model?: string;
  temperature?: number;
  tokensPrompt?: number;
  tokensCompletion?: number;
  tokensTotal?: number;
  cost?: number;
  meta?: Record<string, any>;
}

export interface IFileStats {
  totalUploads?: number;
  uploadedTypes?: string[];
}

export interface IConversation extends MongooseDocument {
  _id: Types.ObjectId;
  sessionId: string;
  visitorFingerprint?: string;
  ip?: string;
  userAgent?: string;
  customerId?: Types.ObjectId;
  messages: IMessage[];
  llm?: ILLMStats;
  messageCount?: number;
  fileStats?: IFileStats;
  summaryId?: Types.ObjectId;
  status?: ConversationStatus;
  meta?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// Attachment Types
// ============================================================================

export type AttachmentType = 'site_photo' | 'roof_photo' | 'angle_photo' | 'other';

export interface IAttachment extends MongooseDocument {
  _id: Types.ObjectId;
  url: string;
  key?: string;
  filename?: string;
  type: AttachmentType;
  mimeType?: string;
  size?: number;
  createdAt?: Date;
  updatedAt?: Date;
}


// ============================================================================
// ConversationSummary Types
// ============================================================================

export interface IConversationSummary extends MongooseDocument {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  summaryText?: string;
  tokensUsed?: number;
  cost?: number;
  meta?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// User Types (for authentication)
// ============================================================================

export interface User extends MongooseDocument {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: "admin" | "user" | "subAdmin" | "superAdmin";
  enabled: number;
  isVerified: number;
  emailVerified?: {
    verifiedAt: number;
    verified: boolean;
  };
  createdAt?: number;
  updatedAt?: number;
}

// ============================================================================
// FormConfig Types
// ============================================================================



export interface IFormConfig extends MongooseDocument {
  title: string;
  welcomeMessage: string;
  locale: string;
  description: string;
  formJson: any;
  createdBy?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// Communication Types
// ============================================================================

export type CommunicationType = 'email' | 'whatsapp' | 'telegram';
export type CommunicationStatus = 'draft' | 'sent' | 'failed' | 'pending';

export interface ICommunication extends MongooseDocument {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  type: CommunicationType;
  subject?: string;
  content: string;
  status: CommunicationStatus;
  sentBy: Types.ObjectId;
  sentAt?: Date;
  metadata?: Record<string, any>;
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// Result Type
// ============================================================================

export interface SendMessageResult {
  conversation: IConversation;
  message: IMessage;
  extractedData?: Record<string, any>;
}

export type resultType =
  | (Partial<ICustomer> | Partial<ICustomer[]> | null)
  | (Partial<IConversation> | Partial<IConversation[]> | null)
  | (Partial<IAttachment> | Partial<IAttachment[]> | null)
  | (Partial<IConversationSummary> | Partial<IConversationSummary[]> | null)
  | (Partial<User> | Partial<User[]> | null)
  | (SendMessageResult | null);

