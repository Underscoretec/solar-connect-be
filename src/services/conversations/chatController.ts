// src/controllers/chatController.ts

import { Request, Response } from 'express';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import Conversation from './model';
import Customer from '../customers/model';
import Attachment from '../attachments/model';
import * as flowManager from './flow-manager';
import { SYSTEM_PROMPT } from '../../prompts/systemPrompt';
import { FORM_JSON2 } from '../../prompts/formJson';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface ChatRequest {
  sessionId: string;
  message: string;
  attachments?: Array<{
    url: string;
    key?: string;
    filename?: string;
    type: string;
    mimeType?: string;
    size?: number;
  }>;
  visitorFingerprint?: string;
  metadata?: {
    ip?: string;
    userAgent?: string;
  };
}

interface FlowState {
  currentPath: string[];
  completedQuestions: Set<string>;
  collectedAnswers: Array<{
    id: string;
    questionId: string;
    value: any;
    timestamp: Date;
  }>;
  activeConditionalFlow: string | null;
}

/**
 * Extract name from collected answers by finding the name field dynamically from form JSON
 */
function extractNameFromAnswers(
  collectedAnswers: Array<{ id: string; questionId: string; value: any; timestamp: Date }>,
  formJson: any
): string {
  const nameFieldPatterns = ['full_name', 'name', 'first_name', 'firstName', 'fullName', 'customer_name', 'user_name'];

  let nameQuestionId: string | null = null;

  for (const question of formJson.flow || []) {
    const questionId = question.questionId || question.id;
    if (nameFieldPatterns.some(pattern =>
      questionId.toLowerCase().includes(pattern.toLowerCase()) ||
      questionId.toLowerCase().includes('name')
    )) {
      nameQuestionId = questionId;
      break;
    }
  }

  if (!nameQuestionId) {
    nameQuestionId = nameFieldPatterns.find(pattern =>
      collectedAnswers.some(a => a.questionId === pattern)
    ) || null;
  }

  if (nameQuestionId) {
    const nameAnswer = collectedAnswers.find(a => a.questionId === nameQuestionId);
    if (nameAnswer?.value) {
      return String(nameAnswer.value);
    }
  }

  const textAnswers = collectedAnswers.filter(a => {
    const value = String(a.value || '');
    return value.length > 2 &&
      !value.includes('@') &&
      !/^\+?[0-9]{7,15}$/.test(value);
  });

  if (textAnswers.length > 0) {
    return String(textAnswers[0].value);
  }

  return 'there';
}

/**
 * Replace all name placeholders in completion message
 */
function replaceNamePlaceholders(message: string, userName: string): string {
  const placeholders = ['{name}', '{full_name}', '{fullName}', '{firstName}', '{first_name}', '{user_name}', '{customer_name}'];

  let result = message;
  for (const placeholder of placeholders) {
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), userName);
  }

  return result;
}

/**
 * Main handler: process incoming chat message
 */
export async function handleChatMessage(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, message, attachments, visitorFingerprint, metadata }: ChatRequest = req.body;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
      return;
    }

    const hasAttachments = attachments && attachments.length > 0;
    const hasMessage = message && message.trim().length > 0;

    if (!hasMessage && !hasAttachments) {
      res.status(400).json({
        success: false,
        error: 'message is required (or provide attachments)'
      });
      return;
    }

    let conversation = await Conversation.findOne({ sessionId });

    if (!conversation && mongoose.Types.ObjectId.isValid(sessionId)) {
      conversation = await Conversation.findById(sessionId);
    }

    if (!conversation) {
      conversation = new Conversation({
        sessionId,
        visitorFingerprint,
        ip: metadata?.ip || req.ip,
        userAgent: metadata?.userAgent || req.headers['user-agent'],
        messages: [],
        status: 'open',
        messageCount: 0,
        fileStats: {
          totalUploads: 0,
          uploadedTypes: []
        },
        meta: {}
      });
    }

    if (!conversation.messageCount) {
      conversation.messageCount = 0;
    }
    if (!conversation.fileStats) {
      conversation.fileStats = {
        totalUploads: 0,
        uploadedTypes: []
      };
    }

    const userMessageAttachments = attachments ? await saveAttachments(attachments) : [];
    const normalizedMessage = message || (hasAttachments ? '[User uploaded files]' : '');

    conversation.messages.push({
      role: 'user',
      text: normalizedMessage,
      attachments: userMessageAttachments.map(a => a._id),
      createdAt: new Date()
    } as any);

    conversation.messageCount = (conversation.messageCount || 0) + 1;

    if (userMessageAttachments.length > 0) {
      conversation.fileStats.totalUploads = (conversation.fileStats.totalUploads || 0) + userMessageAttachments.length;
      conversation.fileStats.uploadedTypes = [
        ...new Set([
          ...(conversation.fileStats.uploadedTypes || []),
          ...userMessageAttachments.map(a => a.type)
        ])
      ];
    }

    const flowState = buildFlowState(conversation);

    // CRITICAL: Log flow state for debugging
    console.log('Flow State:', {
      activeConditionalFlow: flowState.activeConditionalFlow,
      completedCount: flowState.completedQuestions.size,
      completedQuestions: Array.from(flowState.completedQuestions)
    });

    const nextQuestion = flowManager.getNextQuestion(flowState, FORM_JSON2);

    if (!nextQuestion) {
      await handleFormCompletion(conversation, flowState);
      await conversation.save();

      res.json({
        success: true,
        message: 'Thank you! Your information has been collected.',
        status: 'complete',
        completionPercentage: 100
      });
      return;
    }

    const llmMessages = prepareLLMMessages(conversation, nextQuestion, flowState);

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: llmMessages,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });
    const duration = Date.now() - startTime;

    const llmResponse = JSON.parse(completion.choices[0].message.content || '{}');

    conversation.llm = {
      model: completion.model,
      temperature: 0.7,
      tokensPrompt: completion.usage?.prompt_tokens || 0,
      tokensCompletion: completion.usage?.completion_tokens || 0,
      tokensTotal: completion.usage?.total_tokens || 0,
      cost: calculateCost(completion),
      meta: {
        lastCallDuration: duration,
        lastFinishReason: completion.choices[0].finish_reason
      }
    };

    let uiHint = flowManager.getUIHint(nextQuestion);
    let currentQuestionId: string | null = nextQuestion.questionId;

    if (llmResponse.extracted && Object.keys(llmResponse.extracted).length > 0) {
      let hasValidExtraction = false;

      if (nextQuestion.type === 'form' && nextQuestion.children) {
        const flatQuestions = flowManager.getFlatQuestions(FORM_JSON2);
        const childQuestionIds = nextQuestion.children.map((child: any) => {
          const childQuestion = Array.from(flatQuestions.values()).find(q => q.id === child.id);
          return childQuestion?.questionId || child.questionId;
        });

        hasValidExtraction = childQuestionIds.some((childId: string) => {
          const value = llmResponse.extracted[childId];
          return value !== null && value !== undefined && value !== '';
        });
      } else if (nextQuestion.type === 'files') {
        const extractedValue = llmResponse.extracted[nextQuestion.questionId];
        const hasActualAttachments = userMessageAttachments.length > 0;
        const explicitlyConfirmed = extractedValue === 'files_uploaded' &&
          (normalizedMessage.toLowerCase().includes('upload') ||
            normalizedMessage.toLowerCase().includes('file') ||
            normalizedMessage.toLowerCase().includes('photo') ||
            normalizedMessage.toLowerCase().includes('image'));

        hasValidExtraction = extractedValue === 'files_uploaded' && (hasActualAttachments || explicitlyConfirmed);
      } else {
        const extractedValue = llmResponse.extracted[nextQuestion.questionId];
        hasValidExtraction = extractedValue !== null && extractedValue !== undefined && extractedValue !== '';
      }

      if (hasValidExtraction) {
        const processResult = flowManager.processAnswer(
          nextQuestion.questionId,
          llmResponse.extracted,
          flowState,
          FORM_JSON2
        );

        if (processResult.success && processResult.completedQuestionIds.length > 0) {
          const flatQuestions = flowManager.getFlatQuestions(FORM_JSON2);

          processResult.completedQuestionIds.forEach(qId => {
            const question = Array.from(flatQuestions.values()).find(q => q.id === qId);
            if (question) {
              const qKey = question.questionId || question.id;
              conversation.messages.push({
                role: 'system',
                payload: {
                  questionId: qKey,
                  value: llmResponse.extracted[qKey],
                  questionType: question.type
                },
                questionId: qKey,
                createdAt: new Date()
              } as any);
            }
          });

          if (processResult.newConditionalFlow) {
            flowState.activeConditionalFlow = processResult.newConditionalFlow;
            conversation.meta = {
              ...conversation.meta,
              activeConditionalFlow: processResult.newConditionalFlow
            };
            console.log('Started conditional flow:', processResult.newConditionalFlow);
          }

          if (nextQuestion.type === 'files' && userMessageAttachments.length > 0) {
            await linkAttachmentsToQuestion(conversation, nextQuestion.questionId, userMessageAttachments);
          }

          // Handle customer identification/update
          if (nextQuestion.questionId === 'email' && llmResponse.extracted.email) {
            await handleCustomerIdentification(conversation, llmResponse.extracted.email, flowState);
          } else if (conversation.customerId) {
            await updateCustomerProfile(conversation, flowState);
          }

          // CRITICAL FIX: Check if conditional flow was completed
          const hadConditionalFlow = flowState.activeConditionalFlow !== null;
          const updatedNextQuestion = flowManager.getNextQuestion(flowState, FORM_JSON2);

          // If we had a conditional flow and now activeConditionalFlow is null, it means we completed it
          if (hadConditionalFlow && flowState.activeConditionalFlow === null) {
            conversation.meta = {
              ...conversation.meta,
              activeConditionalFlow: null
            };
            console.log('Completed conditional flow, returning to main flow');
          }

          if (updatedNextQuestion) {
            uiHint = flowManager.getUIHint(updatedNextQuestion);
            currentQuestionId = updatedNextQuestion.questionId;

            console.log('Next question:', {
              questionId: updatedNextQuestion.questionId,
              type: updatedNextQuestion.type,
              isInConditionalFlow: flowState.activeConditionalFlow !== null
            });
          } else {
            await handleFormCompletion(conversation, flowState);
            await conversation.save();

            const completionPercentage = flowManager.getCompletionPercentage(flowState, FORM_JSON2);
            const completionMessage = FORM_JSON2.completion?.message || 'Thank you! Your information has been collected.';
            const userName = extractNameFromAnswers(flowState.collectedAnswers, FORM_JSON2);
            const finalMessage = replaceNamePlaceholders(completionMessage, userName);

            res.json({
              success: true,
              message: finalMessage,
              status: 'complete',
              completionPercentage: 100,
              uiHint: null,
              metadata: {
                questionId: null,
                confidence: 'high',
                needsClarification: false,
                completionPercentage: 100,
                conversationId: conversation._id
              }
            });
            return;
          }
        } else {
          if (processResult.error) {
            llmResponse.conversationalResponse = processResult.error;
          }
        }
      }
    }

    conversation.messages.push({
      role: 'assistant',
      text: llmResponse.conversationalResponse,
      payload: {
        uiHint,
        extracted: llmResponse.extracted,
        confidence: llmResponse.confidence,
        needsClarification: llmResponse.needsClarification
      },
      questionId: currentQuestionId,
      createdAt: new Date()
    } as any);

    conversation.messageCount = (conversation.messageCount || 0) + 1;

    await conversation.save();

    const completionPercentage = flowManager.getCompletionPercentage(flowState, FORM_JSON2);

    res.json({
      success: true,
      message: llmResponse.conversationalResponse,
      uiHint,
      metadata: {
        questionId: currentQuestionId,
        confidence: llmResponse.confidence,
        needsClarification: llmResponse.needsClarification,
        completionPercentage,
        conversationId: conversation._id
      }
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
}

/**
 * Fetch conversation details + flow status
 */
export async function getConversation(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;

    const conversation = await Conversation.findOne({ sessionId })
      .populate('messages.attachments')
      .populate('customerId');

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
      return;
    }

    const flowState = buildFlowState(conversation);
    const completionPercentage = flowManager.getCompletionPercentage(flowState, FORM_JSON2);
    const nextQuestion = flowManager.getNextQuestion(flowState, FORM_JSON2);

    res.json({
      success: true,
      conversation: {
        sessionId: conversation.sessionId,
        status: conversation.status,
        messageCount: conversation.messageCount,
        completionPercentage,
        messages: conversation.messages.filter((m: any) => m.role !== 'system'),
        nextQuestion: nextQuestion
          ? {
            questionId: nextQuestion.questionId,
            uiHint: flowManager.getUIHint(nextQuestion)
          }
          : null,
        customer: conversation.customerId
      }
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation'
    });
  }
}

/**
 * Build flow state from stored system messages
 */
function buildFlowState(conversation: any): FlowState {
  const flowState: FlowState = {
    currentPath: [],
    completedQuestions: new Set(),
    collectedAnswers: [],
    activeConditionalFlow: conversation.meta?.activeConditionalFlow || null
  };

  const flatQuestions = flowManager.getFlatQuestions(FORM_JSON2);

  conversation.messages
    .filter((m: any) => m.role === 'system' && m.payload?.questionId)
    .forEach((m: any) => {
      const question = Array.from(flatQuestions.values()).find(
        q => (q.questionId || q.id) === m.payload.questionId
      );

      if (question) {
        flowState.completedQuestions.add(question.id);
        flowState.collectedAnswers.push({
          id: question.id,
          questionId: m.payload.questionId,
          value: m.payload.value,
          timestamp: m.createdAt
        });
      }
    });

  return flowState;
}

/**
 * Prepare LLM messages: system prompt + current question context + recent history
 */
function prepareLLMMessages(
  conversation: any,
  nextQuestion: any,
  flowState: FlowState
): any[] {
  const messages: any[] = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    }
  ];

  const questionContext = {
    currentQuestion: {
      questionId: nextQuestion.questionId,
      type: nextQuestion.type,
      placeholder: nextQuestion.placeholder,
      required: nextQuestion.required,
      context: nextQuestion.context,
      validation: nextQuestion.validation,
      options: nextQuestion.options,
      children: nextQuestion.children
    },
    collectedAnswers: flowState.collectedAnswers.map(a => ({
      questionId: a.questionId,
      value: a.value
    })),
    completionPercentage: flowManager.getCompletionPercentage(flowState, FORM_JSON2),
    isInConditionalFlow: flowState.activeConditionalFlow !== null
  };

  messages.push({
    role: 'system',
    content: `Current Question Context:\n${JSON.stringify(questionContext, null, 2)}`
  });

  const recentMessages = conversation.messages
    .filter((m: any) => m.role !== 'system')
    .slice(-10);

  recentMessages.forEach((m: any) => {
    messages.push({
      role: m.role,
      content: m.text
    });
  });

  return messages;
}

/**
 * FIXED: Extract all attachment IDs from conversation messages
 */
function extractAllAttachmentIds(conversation: any): any[] {
  const allAttachmentIds: any[] = [];

  conversation.messages.forEach((msg: any) => {
    if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      msg.attachments.forEach((att: any) => {
        // Handle both ObjectId and populated attachment objects
        const attId = att._id || att;
        if (attId && mongoose.Types.ObjectId.isValid(attId.toString())) {
          allAttachmentIds.push(attId);
        }
      });
    }
  });

  // Deduplicate
  return [...new Set(allAttachmentIds.map(id => id.toString()))];
}

/**
 * FIXED: Identify or create customer from email AND save ALL collected data including attachments
 */
async function handleCustomerIdentification(conversation: any, email: string, flowState: FlowState): Promise<void> {
  try {
    let customer = await Customer.findOne({ 'profile.email': email });

    if (!customer) {
      const phoneAnswer = flowState.collectedAnswers.find(a => a.questionId === 'phone');
      if (phoneAnswer?.value) {
        customer = await Customer.findOne({ 'profile.phone': phoneAnswer.value });
      }
    }

    const isNew = !customer;

    // Build complete customer profile from ALL collected answers
    const profile = flowManager.buildCustomerProfile(flowState.collectedAnswers, FORM_JSON2);

    // CRITICAL FIX: Extract ALL attachment IDs from the conversation
    const allAttachmentIds = extractAllAttachmentIds(conversation);

    console.log('Extracted attachment IDs:', allAttachmentIds);

    if (!customer) {
      customer = new Customer({
        profile: {
          ...profile,
          email
        },
        attachments: allAttachmentIds.map(id => new mongoose.Types.ObjectId(id)),
        meta: {
          source: 'chat',
          firstContactDate: new Date()
        }
      });
      await customer.save();
      console.log(`Created customer with ${allAttachmentIds.length} attachments`);
    } else {
      customer.profile = {
        ...customer.profile,
        ...profile,
        email
      };

      // Merge attachments
      const existingAttachments = (customer.attachments || []).map(a => a.toString());
      const mergedAttachments = [...new Set([...existingAttachments, ...allAttachmentIds])];
      customer.attachments = mergedAttachments.map(id => new mongoose.Types.ObjectId(id));

      customer.meta = {
        ...customer.meta,
        lastUpdated: new Date(),
        updatedViaChat: true
      };
      await customer.save();
      console.log(`Updated customer with ${mergedAttachments.length} total attachments`);
    }

    conversation.customerId = customer._id;
    conversation.meta = {
      ...conversation.meta,
      customerIdentified: true,
      customerCreated: isNew
    };

  } catch (error) {
    console.error('Customer identification error:', error);
  }
}

/**
 * FIXED: Update customer profile with ongoing collected data including attachments
 */
async function updateCustomerProfile(conversation: any, flowState: FlowState): Promise<void> {
  try {
    if (!conversation.customerId) return;

    const customer = await Customer.findById(conversation.customerId);
    if (!customer) return;

    // Rebuild profile from all collected answers
    const profile = flowManager.buildCustomerProfile(flowState.collectedAnswers, FORM_JSON2);

    // CRITICAL FIX: Extract ALL attachment IDs from the conversation
    const allAttachmentIds = extractAllAttachmentIds(conversation);

    customer.profile = {
      ...customer.profile,
      ...profile
    };

    // Merge attachments
    const existingAttachments = (customer.attachments || []).map(a => a.toString());
    const mergedAttachments = [...new Set([...existingAttachments, ...allAttachmentIds])];
    customer.attachments = mergedAttachments.map(id => new mongoose.Types.ObjectId(id));

    customer.meta = {
      ...customer.meta,
      lastUpdated: new Date(),
      updatedViaChat: true
    };

    await customer.save();
    console.log(`Customer profile updated with ${mergedAttachments.length} total attachments`);
  } catch (error) {
    console.error('Update customer profile error:', error);
  }
}

/**
 * Handle form completion: ensure customer is up-to-date, attach all files, mark conversation closed
 */
async function handleFormCompletion(conversation: any, flowState: FlowState): Promise<void> {
  try {
    const profile = flowManager.buildCustomerProfile(flowState.collectedAnswers, FORM_JSON2);

    let customer = conversation.customerId
      ? await Customer.findById(conversation.customerId)
      : null;

    if (!customer && profile.email) {
      customer = await Customer.findOne({ 'profile.email': profile.email });
    }

    // Extract all attachments
    const allAttachmentIds = extractAllAttachmentIds(conversation);

    if (!customer) {
      customer = new Customer({
        profile,
        attachments: allAttachmentIds.map(id => new mongoose.Types.ObjectId(id)),
        meta: {
          source: 'chat',
          firstContactDate: new Date(),
          completedFormDate: new Date()
        }
      });
    } else {
      customer.profile = { ...customer.profile, ...profile };

      const existingAttachments = (customer.attachments || []).map(a => a.toString());
      const mergedAttachments = [...new Set([...existingAttachments, ...allAttachmentIds])];
      customer.attachments = mergedAttachments.map(id => new mongoose.Types.ObjectId(id));

      customer.meta = {
        ...customer.meta,
        lastUpdated: new Date(),
        completedFormDate: new Date(),
        updatedViaChat: true
      };
    }

    await customer.save();

    conversation.customerId = customer._id;
    conversation.status = 'closed';
    conversation.meta = {
      ...conversation.meta,
      formCompleted: true,
      completionDate: new Date()
    };

    console.log(`Form completed for customer: ${customer._id} with ${allAttachmentIds.length} attachments`);
  } catch (error) {
    console.error('Form completion error:', error);
    throw error;
  }
}

/**
 * Persist attachments to DB
 */
async function saveAttachments(attachments: any[]): Promise<any[]> {
  const saved: any[] = [];

  for (const att of attachments) {
    const attachment = new Attachment(att);
    await attachment.save();
    saved.push(attachment);
  }

  return saved;
}

/**
 * Link uploaded attachments to a specific question's system message
 */
async function linkAttachmentsToQuestion(
  conversation: any,
  questionId: string,
  attachments: any[]
): Promise<void> {
  const systemMessage = conversation.messages.find(
    (m: any) => m.role === 'system' && m.questionId === questionId
  );

  if (systemMessage) {
    systemMessage.attachments = attachments.map(a => a._id);
    systemMessage.payload = {
      ...systemMessage.payload,
      attachmentCount: attachments.length
    };
  }
}

/**
 * Estimate API call cost
 */
function calculateCost(completion: any): number {
  const model = completion.model;
  const promptTokens = completion.usage?.prompt_tokens || 0;
  const completionTokens = completion.usage?.completion_tokens || 0;

  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10, output: 30 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 }
  };

  const modelPricing = pricing[model] || pricing['gpt-4o-mini'];

  return (
    (promptTokens / 1_000_000) * modelPricing.input +
    (completionTokens / 1_000_000) * modelPricing.output
  );
}

export default {
  handleMessage: handleChatMessage,
  getConversation
};