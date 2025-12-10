import { FORM_JSON2 } from '../../prompts/formJson';

export interface FlowQuestion {
  id: string;
  questionId: string;
  type: string;
  required: boolean;
  placeholder?: string;
  validation?: any;
  context?: string;
  options?: any[];
  children?: any[];
  optionFlows?: Record<string, any[]>;
}

export interface CollectedAnswer {
  id: string;
  questionId: string;
  value: any;
  timestamp: Date;
}

export interface FlowState {
  currentPath: string[];
  completedQuestions: Set<string>;
  collectedAnswers: CollectedAnswer[];
  activeConditionalFlow: string | null;
}

// Cache for indexed questions
let flatQuestionsCache: Map<string, FlowQuestion> | null = null;

/**
 * Index all questions for quick lookup
 */
function indexQuestions(formJson: any = FORM_JSON2): Map<string, FlowQuestion> {
  if (flatQuestionsCache) return flatQuestionsCache;

  const flatQuestions = new Map<string, FlowQuestion>();

  const indexRecursive = (questions: any[], parentPath: string = '') => {
    for (const q of questions) {
      const path = parentPath ? `${parentPath}.${q.id}` : q.id;
      flatQuestions.set(q.id, { ...q, _path: path } as any);

      // Index children for form type
      if (q.children && Array.isArray(q.children)) {
        indexRecursive(q.children, path);
      }

      // Index optionFlows for choice type
      if (q.optionFlows) {
        Object.values(q.optionFlows).forEach((flow: any) => {
          if (Array.isArray(flow)) {
            indexRecursive(flow, path);
          }
        });
      }
    }
  };

  indexRecursive(formJson.flow);
  flatQuestionsCache = flatQuestions;
  return flatQuestions;
}

/**
 * Get questions from a conditional flow
 */
function getConditionalFlowQuestions(
  flowKey: string,
  formJson: any = FORM_JSON2
): FlowQuestion[] {
  const flatQuestions = indexQuestions(formJson);
  const [questionId, optionValue] = flowKey.split(':');

  const choiceQuestion = Array.from(flatQuestions.values()).find(
    q => q.questionId === questionId && q.type === 'choice'
  );

  if (!choiceQuestion || !choiceQuestion.optionFlows) {
    return [];
  }

  return choiceQuestion.optionFlows[optionValue] || [];
}

/**
 * Check if all questions in a conditional flow are completed
 */
function isConditionalFlowComplete(
  flowKey: string,
  completedQuestions: Set<string>,
  formJson: any = FORM_JSON2
): boolean {
  const flowQuestions = getConditionalFlowQuestions(flowKey, formJson);

  if (flowQuestions.length === 0) return true;

  // Check if ALL required questions in the flow are completed
  const allRequiredComplete = flowQuestions
    .filter(q => q.required !== false)
    .every(q => completedQuestions.has(q.id));

  console.log('Conditional flow completion check:', {
    flowKey,
    totalQuestions: flowQuestions.length,
    requiredQuestions: flowQuestions.filter(q => q.required !== false).length,
    completedRequired: flowQuestions.filter(q => q.required !== false && completedQuestions.has(q.id)).length,
    isComplete: allRequiredComplete
  });

  return allRequiredComplete;
}

/**
 * Prepare question with UI hints (remove optionFlows)
 */
function prepareQuestion(question: FlowQuestion): FlowQuestion {
  const prepared = { ...question };

  // Remove optionFlows from the question sent to LLM
  if (prepared.type === 'choice') {
    delete (prepared as any).optionFlows;
  }

  return prepared;
}

/**
 * FIXED: Get the next question to ask based on current state
 */
export function getNextQuestion(
  flowState: FlowState,
  formJson: any = FORM_JSON2
): FlowQuestion | null {
  const { completedQuestions, activeConditionalFlow } = flowState;

  // CRITICAL FIX: If we're in a conditional flow, check if it's complete
  if (activeConditionalFlow) {
    const isFlowComplete = isConditionalFlowComplete(
      activeConditionalFlow,
      completedQuestions,
      formJson
    );

    if (isFlowComplete) {
      // Conditional flow is complete, reset it and continue to main flow
      flowState.activeConditionalFlow = null;
      console.log('Conditional flow completed, resetting to main flow');
    } else {
      // Still in conditional flow, get next question from it
      const conditionalQuestions = getConditionalFlowQuestions(activeConditionalFlow, formJson);

      for (const q of conditionalQuestions) {
        if (!completedQuestions.has(q.id)) {
          console.log('Next question from conditional flow:', q.questionId);
          return prepareQuestion(q);
        }
      }

      // All questions completed but flow not marked complete? Reset it
      flowState.activeConditionalFlow = null;
      console.log('All conditional questions completed, resetting flow');
    }
  }

  // Process main flow
  for (const item of formJson.flow) {
    if (!completedQuestions.has(item.id)) {
      console.log('Next question from main flow:', item.questionId);
      return prepareQuestion(item);
    }
  }

  // All questions completed
  console.log('All questions completed');
  return null;
}

/**
 * Validate and store answer
 */
function validateAndStore(
  question: FlowQuestion,
  value: any,
  flowState: FlowState
): void {
  // Perform validation if specified
  if (question.validation) {
    if (question.validation.pattern) {
      const regex = new RegExp(question.validation.pattern);
      if (!regex.test(String(value))) {
        throw new Error(`Invalid format for ${question.questionId}`);
      }
    }

    if (question.validation.minLength && String(value).length < question.validation.minLength) {
      throw new Error(`Value too short for ${question.questionId}`);
    }

    if (question.validation.maxLength && String(value).length > question.validation.maxLength) {
      throw new Error(`Value too long for ${question.questionId}`);
    }
  }

  // Store the answer
  flowState.collectedAnswers.push({
    id: question.id,
    questionId: question.questionId,
    value,
    timestamp: new Date()
  });
}

/**
 * Process extracted answer and update flow state
 */
export function processAnswer(
  questionId: string,
  extractedData: Record<string, any>,
  flowState: FlowState,
  formJson: any = FORM_JSON2
): {
  success: boolean;
  newConditionalFlow?: string;
  completedQuestionIds: string[];
  error?: string;
} {
  const flatQuestions = indexQuestions(formJson);
  const question = Array.from(flatQuestions.values()).find(q => q.questionId === questionId);

  if (!question) {
    return {
      success: false,
      completedQuestionIds: [],
      error: 'Question not found'
    };
  }

  const completedIds: string[] = [];

  try {
    // Handle different question types
    switch (question.type) {
      case 'text':
      case 'email':
      case 'number':
        if (extractedData[questionId] !== null && extractedData[questionId] !== undefined) {
          validateAndStore(question, extractedData[questionId], flowState);
          completedIds.push(question.id);
          flowState.completedQuestions.add(question.id);
        }
        break;

      case 'choice':
        const choiceValue = extractedData[questionId];
        if (choiceValue) {
          validateAndStore(question, choiceValue, flowState);
          completedIds.push(question.id);
          flowState.completedQuestions.add(question.id);

          // Check if this choice has a conditional flow
          const originalQuestion = formJson.flow.find((q: any) => q.id === question.id);
          if (originalQuestion?.optionFlows && originalQuestion.optionFlows[choiceValue]) {
            const flowKey = `${questionId}:${choiceValue}`;
            console.log('Starting new conditional flow:', flowKey);
            return {
              success: true,
              newConditionalFlow: flowKey,
              completedQuestionIds: completedIds
            };
          }
        }
        break;

      case 'form':
        // Process all children
        if (question.children) {
          for (const child of question.children) {
            const childQuestion = Array.from(flatQuestions.values()).find(
              q => q.id === child.id || q.questionId === child.questionId
            );

            if (childQuestion) {
              const childValue = extractedData[childQuestion.questionId];
              if (childValue !== null && childValue !== undefined && childValue !== '') {
                validateAndStore(childQuestion, childValue, flowState);
                completedIds.push(childQuestion.id);
                flowState.completedQuestions.add(childQuestion.id);
              }
            }
          }

          // Mark parent as complete if all required children are done
          const allRequiredComplete = question.children
            .filter((c: any) => c.required !== false)
            .every((c: any) => flowState.completedQuestions.has(c.id));

          if (allRequiredComplete) {
            completedIds.push(question.id);
            flowState.completedQuestions.add(question.id);
          }
        }
        break;

      case 'files':
        if (extractedData[questionId] === 'files_uploaded') {
          // Files are handled separately, just mark as complete
          completedIds.push(question.id);
          flowState.completedQuestions.add(question.id);
        }
        break;
    }

    return {
      success: true,
      completedQuestionIds: completedIds
    };

  } catch (error) {
    return {
      success: false,
      completedQuestionIds: [],
      error: (error as Error).message
    };
  }
}

/**
 * Build customer profile from collected answers
 */
export function buildCustomerProfile(
  collectedAnswers: CollectedAnswer[],
  formJson: any = FORM_JSON2
): any {
  const profile: any = {};

  // Create a map for quick lookup
  const answerMap = new Map(
    collectedAnswers.map(a => [a.questionId, a.value])
  );

  // Build profile structure following form hierarchy
  const buildRecursive = (questions: any[], target: any = {}) => {
    for (const q of questions) {
      const value = answerMap.get(q.questionId);

      if (value !== undefined && value !== null) {
        if (q.type === 'form' && q.children) {
          // Create nested object for form groups
          target[q.questionId] = {};
          buildRecursive(q.children, target[q.questionId]);
        } else if (q.type === 'files') {
          // Files are stored as attachment references, not in profile
          // Skip them here
          continue;
        } else {
          target[q.questionId] = value;
        }
      }

      // Handle optionFlows recursively
      if (q.optionFlows && value) {
        const conditionalFlow = q.optionFlows[value];
        if (conditionalFlow) {
          buildRecursive(conditionalFlow, target);
        }
      }
    }
    return target;
  };

  return buildRecursive(formJson.flow, profile);
}

/**
 * Get UI hint for a question
 */
export function getUIHint(question: FlowQuestion): any {
  return {
    type: question.type,
    placeholder: question.placeholder || null,
    options: question.options || null,
    children: question.children || null,
    validation: question.validation || null,
    context: question.context || null
  };
}

/**
 * Count total questions in main flow + active conditional flow
 */
function countTotalQuestions(flowState: FlowState, formJson: any = FORM_JSON2): number {
  let count = 0;

  const countRecursive = (questions: any[]) => {
    for (const q of questions) {
      count++;

      if (q.children) {
        countRecursive(q.children);
      }
    }
  };

  // Count main flow
  countRecursive(formJson.flow);

  // Add active conditional flow questions if any
  if (flowState.activeConditionalFlow) {
    const conditionalQuestions = getConditionalFlowQuestions(
      flowState.activeConditionalFlow,
      formJson
    );
    count += conditionalQuestions.length;
  }

  return count;
}

/**
 * Calculate completion percentage
 */
export function getCompletionPercentage(
  flowState: FlowState,
  formJson: any = FORM_JSON2
): number {
  const totalQuestions = countTotalQuestions(flowState, formJson);
  const completed = flowState.completedQuestions.size;
  return Math.round((completed / totalQuestions) * 100);
}

/**
 * Check if form is complete
 */
export function isFormComplete(
  flowState: FlowState,
  formJson: any = FORM_JSON2
): boolean {
  const nextQuestion = getNextQuestion(flowState, formJson);
  return nextQuestion === null;
}

/**
 * Get collected answers summary for LLM context
 */
export function getCollectedAnswersSummary(collectedAnswers: CollectedAnswer[]): string {
  if (collectedAnswers.length === 0) return 'No information collected yet.';

  return collectedAnswers
    .map(a => `${a.questionId}: ${JSON.stringify(a.value)}`)
    .join(', ');
}

/**
 * Get flat questions map (for external use)
 */
export function getFlatQuestions(formJson: any = FORM_JSON2): Map<string, FlowQuestion> {
  return indexQuestions(formJson);
}