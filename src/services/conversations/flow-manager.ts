import { FORM_JSON2 } from "../../prompts/formJson";


interface FlowState {
  mainFlowIndex: number;
  conditionalFlowParent: string | null;
  conditionalFlowIndex: number;
  completedFields: Set<string>;
}

interface QuestionContext {
  questionId: string;
  type: string;
  required: boolean;
  placeholder: string;
  options?: any[];
  children?: any[];
  validation?: any;
  isLastQuestion: boolean;
}

/**
 * Flow Manager - Handles all flow navigation logic
 * Keeps track of main flow and conditional flows
 */
export class FlowManager {
  private state: FlowState;
  private formConfig: any;

  constructor(conversationMessages: any[]) {
    this.formConfig = FORM_JSON2;
    this.state = this.initializeState(conversationMessages);
  }

  /**
   * Initialize state from conversation history
   */
  private initializeState(messages: any[]): FlowState {
    const completedFields = new Set<string>();
    let mainFlowIndex = 0;
    let conditionalFlowParent: string | null = null;
    let conditionalFlowIndex = 0;

    // Analyze conversation to determine current state
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.payload?.action === 'store_answer') {
        const storedId = msg.payload.storedQuestionId;
        if (storedId) {
          completedFields.add(storedId);
        }
      }
    }

    // Find current position in main flow
    for (let i = 0; i < this.formConfig.flow.length; i++) {
      const field = this.formConfig.flow[i];
      if (!completedFields.has(field.questionId)) {
        mainFlowIndex = i;
        break;
      }

      // Check if we're in a conditional flow
      if (field.optionFlows) {
        const lastStored = this.getLastStoredValue(messages, field.questionId);
        if (lastStored && field.optionFlows[lastStored]) {
          const conditionalQuestions = field.optionFlows[lastStored];

          // Find position in conditional flow
          for (let j = 0; j < conditionalQuestions.length; j++) {
            if (!completedFields.has(conditionalQuestions[j].questionId)) {
              conditionalFlowParent = field.questionId;
              conditionalFlowIndex = j;
              mainFlowIndex = i;
              return { mainFlowIndex, conditionalFlowParent, conditionalFlowIndex, completedFields };
            }
          }
        }
      }

      if (i === this.formConfig.flow.length - 1) {
        mainFlowIndex = i + 1; // All questions completed
      }
    }

    return { mainFlowIndex, conditionalFlowParent, conditionalFlowIndex, completedFields };
  }

  /**
   * Get last stored value for a field
   */
  private getLastStoredValue(messages: any[], fieldId: string): any {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' &&
        msg.payload?.action === 'store_answer' &&
        msg.payload?.storedQuestionId === fieldId) {
        return msg.payload.value;
      }
    }
    return null;
  }

  /**
   * Get the next question to ask
   */
  getNextQuestion(): QuestionContext | null {
    // If we're in a conditional flow, continue it
    if (this.state.conditionalFlowParent) {
      const parentField = this.formConfig.flow.find(
        (f: any) => f.questionId === this.state.conditionalFlowParent
      );

      if (parentField && parentField.optionFlows) {
        const lastValue = this.state.completedFields.has(this.state.conditionalFlowParent)
          ? this.getLastStoredValue([], this.state.conditionalFlowParent)
          : null;

        if (lastValue && parentField.optionFlows[lastValue]) {
          const conditionalQuestions = parentField.optionFlows[lastValue];

          if (this.state.conditionalFlowIndex < conditionalQuestions.length) {
            const question = conditionalQuestions[this.state.conditionalFlowIndex];

            // Check if this is the last question overall
            const isLastConditional = this.state.conditionalFlowIndex === conditionalQuestions.length - 1;
            const isLastMainFlow = this.state.mainFlowIndex === this.formConfig.flow.length - 1;

            return {
              questionId: question.questionId,
              type: question.type,
              required: question.required,
              placeholder: question.placeholder,
              options: question.options,
              children: question.children,
              validation: question.validation,
              isLastQuestion: isLastConditional && isLastMainFlow
            };
          }
        }
      }

      // Conditional flow completed, move to next main flow question
      this.state.conditionalFlowParent = null;
      this.state.conditionalFlowIndex = 0;
      this.state.mainFlowIndex++;
    }

    // Get next main flow question
    if (this.state.mainFlowIndex < this.formConfig.flow.length) {
      const field = this.formConfig.flow[this.state.mainFlowIndex];

      return {
        questionId: field.questionId,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
        options: field.options,
        children: field.children,
        validation: field.validation,
        isLastQuestion: this.state.mainFlowIndex === this.formConfig.flow.length - 1
      };
    }

    // All questions completed
    return null;
  }

  /**
   * Mark a field as completed and update state
   */
  markFieldCompleted(fieldId: string, value: any): void {
    this.state.completedFields.add(fieldId);

    // Check if we just completed a field with conditional flows
    const currentField = this.formConfig.flow[this.state.mainFlowIndex];

    if (currentField && currentField.questionId === fieldId && currentField.optionFlows) {
      // Check if the value has a conditional flow
      if (currentField.optionFlows[value]) {
        // Enter conditional flow
        this.state.conditionalFlowParent = fieldId;
        this.state.conditionalFlowIndex = 0;
        return;
      }
    }

    // If we're in a conditional flow, advance it
    if (this.state.conditionalFlowParent) {
      this.state.conditionalFlowIndex++;
    } else {
      // Advance main flow
      this.state.mainFlowIndex++;
    }
  }

  /**
   * Check if all required fields are completed
   */
  isFormComplete(): boolean {
    return this.state.mainFlowIndex >= this.formConfig.flow.length;
  }

  /**
   * Get collected data from messages
   */
  static getCollectedData(messages: any[]): Record<string, any> {
    const data: Record<string, any> = {};

    for (const msg of messages) {
      if (msg.role === 'assistant' &&
        msg.payload?.action === 'store_answer' &&
        msg.payload?.storedQuestionId &&
        msg.payload?.value !== null &&
        msg.payload?.value !== undefined) {

        const fieldType = msg.payload?.uiHint?.type;

        // Skip file fields in profile
        if (fieldType !== 'files') {
          data[msg.payload.storedQuestionId] = msg.payload.value;
        }
      }
    }

    return data;
  }
}

/**
 * Build context for LLM with only essential information
 */
export function buildLLMContext(
  flowManager: FlowManager,
  messages: any[]
): string {
  const nextQuestion = flowManager.getNextQuestion();

  if (!nextQuestion) {
    // Form complete - prepare for confirmation
    const collectedData = FlowManager.getCollectedData(messages);
    return `\n\n[FLOW COMPLETE]
All questions answered. Use action="request_confirmation" with customerProfile containing:
${JSON.stringify(collectedData, null, 2)}
[/FLOW COMPLETE]\n`;
  }

  // Build minimal context for next question
  const context = `\n\n[CURRENT_QUESTION_CONTEXT]
Next Question ID: ${nextQuestion.questionId}
Type: ${nextQuestion.type}
Required: ${nextQuestion.required}
Placeholder: ${nextQuestion.placeholder}
${nextQuestion.options ? `Options: ${JSON.stringify(nextQuestion.options)}` : ''}
${nextQuestion.children ? `Children: ${JSON.stringify(nextQuestion.children)}` : ''}
${nextQuestion.validation ? `Validation: ${JSON.stringify(nextQuestion.validation)}` : ''}
Is Last Question: ${nextQuestion.isLastQuestion}

INSTRUCTIONS:
- Use action="ask_question" to ask this question
- Extract uiHint from the above details
- After user responds, use action="store_answer" with storedQuestionId="${nextQuestion.questionId}"
${nextQuestion.isLastQuestion ? '- After storing this answer, use action="request_confirmation"' : ''}
[/CURRENT_QUESTION_CONTEXT]\n`;

  return context;
}

/**
 * Get only recent messages to reduce token usage
 */
export function getRecentMessages(messages: any[], limit: number = 6): any[] {
  // Always include first message (initialization)
  if (messages.length <= limit) {
    return messages;
  }

  // Get first message + recent messages
  return [
    messages[0],
    ...messages.slice(-limit)
  ];
}