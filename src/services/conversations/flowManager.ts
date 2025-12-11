// src/services/nextQuestion.ts
// TypeScript — getNextQuestion with improved form behavior and order path support

import { FORM_JSON2 } from "../../prompts/formJson";

export type FieldType = "text" | "form" | "files" | "choice" | "file";

export interface Field {
  id: string;
  order?: number | string;
  questionId: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  context?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  children?: Field[]; // for form/files
  options?: { value: string; label: string }[]; // for choice
  optionFlows?: Record<string, Field[]>; // for choice
  accept?: string[]; // file accept
  maxFiles?: number | string;
  maxSize?: string;
  [k: string]: any;
}

export interface FormJson {
  flow: Field[];
  completion?: any;
}

/** Normalized shape of collected answer item from your frontend */
export interface CollectedItem {
  id: string;
  order?: string;
  questionId: string;
  value: any;
}

/** Result returned by getNextQuestion */
export interface NextQuestionResult {
  nextField: Field | null;
  path: string[]; // questionId path
  orderPath: string[]; // parallel order path, each element is String(order)
  nextOrder: string | null; // joined orderPath like "8", "8:1", "8:2:1"
  isComplete: boolean;
  remainingTopLevelIds: string[];
  completionMessage?: any; // completion message from formJson when isComplete is true
}

/* ---------------------------
   Helpers
   --------------------------- */

/**
 * Unwraps wrapper objects that include a `.value` property (common in collectedData).
 */
function unwrapPossibleWrapper(v: any) {
  if (v && typeof v === "object") {
    if ("value" in v) return v.value;
  }
  return v;
}

function isEmptyValue(v: any): boolean {
  if (v === undefined || v === null) return true;

  const u = unwrapPossibleWrapper(v);

  if (u === undefined || u === null) return true;
  if (typeof u === "string" && u.trim() === "") return true;
  if (Array.isArray(u) && u.length === 0) return true;
  if (typeof u === "object") {
    if (Object.keys(u).length === 0) return true;
  }
  return false;
}

function buildCollectedMap(collected: CollectedItem[]) {
  const map = new Map<string, any>();
  for (const it of collected || []) {
    map.set(it.questionId, it.value);
  }
  return map;
}

/** Basic validation for text fields using the field.validation definition */
function validateTextField(value: any, field: Field): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (field.required) {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      errors.push("required");
      return { ok: false, errors };
    }
  } else {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      return { ok: true, errors };
    }
  }

  if (typeof value !== "string") {
    value = String(value);
  }
  const v = value as string;

  if (field.validation?.minLength !== undefined) {
    if (v.length < field.validation.minLength) {
      errors.push("minLength");
    }
  }
  if (field.validation?.maxLength !== undefined) {
    if (v.length > field.validation.maxLength) {
      errors.push("maxLength");
    }
  }
  if (field.validation?.pattern) {
    try {
      const re = new RegExp(field.validation.pattern);
      if (!re.test(v)) {
        errors.push("pattern");
      }
    } catch (e) {
      // ignore invalid regex
    }
  }

  return { ok: errors.length === 0, errors };
}

/* ---------------------------
   Completeness check
   --------------------------- */

function isFieldComplete(field: Field, collectedMap: Map<string, any>): boolean {
  const q = field.questionId;

  const present = collectedMap.has(q);
  const rawVal = present ? collectedMap.get(q) : undefined;
  const unwrapped = unwrapPossibleWrapper(rawVal);
  const empty = isEmptyValue(rawVal);

  if (field.type === "text" || field.type === "file") {
    if (!present) return false;
    if (empty) return field.required ? false : true;
    if (field.type === "text") {
      const { ok } = validateTextField(unwrapped, field);
      return ok;
    }
    return true;
  }

  if (field.type === "choice") {
    if (!present) return false;
    if (empty) return field.required ? false : true;
    const val = unwrapped;
    if (field.options && field.options.length > 0) {
      const match = field.options.some((o) => o.value === val);
      return match;
    }
    return true;
  }

  if (field.type === "form") {
    if (!field.children || field.children.length === 0) {
      if (!present) return false;
      return !empty;
    }
    for (const child of field.children) {
      const parentObj = collectedMap.get(field.questionId);
      if (parentObj && parentObj[child.questionId] !== undefined) {
        const childRaw = parentObj[child.questionId];
        if (isEmptyValue(childRaw)) {
          if (child.required) return false;
          else continue;
        }
        const { ok } = validateTextField(unwrapPossibleWrapper(childRaw), child);
        if (!ok && child.required) return false;
      } else if (collectedMap.has(child.questionId)) {
        const childRaw = collectedMap.get(child.questionId);
        if (isEmptyValue(childRaw)) {
          if (child.required) return false;
          else continue;
        }
        const { ok } = validateTextField(unwrapPossibleWrapper(childRaw), child);
        if (!ok && child.required) return false;
      } else {
        if (child.required) return false;
      }
    }
    return true;
  }

  if (field.type === "files") {
    if (!field.children || field.children.length === 0) {
      if (!present) return false;
      return !empty;
    }

    for (const child of field.children) {
      const parentObj = collectedMap.get(field.questionId);
      if (parentObj && parentObj.mapping && parentObj.mapping[child.questionId]) {
        const arr = parentObj.mapping[child.questionId];
        if (!Array.isArray(arr) || arr.length === 0) {
          if (child.required) return false;
        } else {
          continue;
        }
      } else if (parentObj && parentObj[child.questionId] !== undefined) {
        const childRaw = parentObj[child.questionId];
        if (isEmptyValue(childRaw)) {
          if (child.required) return false;
        } else {
          continue;
        }
      } else if (collectedMap.has(child.questionId)) {
        const childRaw = collectedMap.get(child.questionId);
        if (isEmptyValue(childRaw)) {
          if (child.required) return false;
        } else {
          continue;
        }
      } else {
        if (child.required) return false;
      }
    }

    let anyPresent = false;
    for (const child of field.children) {
      const parentObj = collectedMap.get(field.questionId);
      if (parentObj && parentObj.mapping && parentObj.mapping[child.questionId] && parentObj.mapping[child.questionId].length > 0) {
        anyPresent = true;
        break;
      }
      if (parentObj && parentObj[child.questionId] !== undefined && !isEmptyValue(parentObj[child.questionId])) {
        anyPresent = true;
        break;
      }
      if (collectedMap.has(child.questionId) && !isEmptyValue(collectedMap.get(child.questionId))) {
        anyPresent = true;
        break;
      }
    }
    return anyPresent;
  }

  return false;
}

/* ---------------------------
   Traversal
   --------------------------- */

/**
 * traverseList returns:
 *  - next: Field | null
 *  - path: questionId path array
 *  - orderPath: order path array (strings)
 *  - remainingTopLevel: string[]
 */
function traverseList(
  list: Field[],
  collectedMap: Map<string, any>,
  parentPath: string[] = [],
  parentOrderPath: string[] = []
): { next: Field | null; path: string[]; orderPath: string[]; remainingTopLevel: string[] } {
  const remainingTopLevel: string[] = [];

  for (const field of list) {
    remainingTopLevel.push(field.questionId);

    const basicComplete = isFieldComplete(field, collectedMap);
    const fieldOrderStr = field.order !== undefined ? String(field.order) : String(field.id || "");

    // CHOICE
    if (field.type === "choice") {
      if (!collectedMap.has(field.questionId)) {
        return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
      }
      const rawVal = collectedMap.get(field.questionId);
      if (isEmptyValue(rawVal)) {
        if (basicComplete) {
          continue;
        }
        return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
      }
      const val = unwrapPossibleWrapper(rawVal);

      if (field.options && field.options.length > 0) {
        const match = field.options.some((o) => o.value === val);
        if (!match) {
          return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
        }
      }

      if (field.optionFlows && typeof val === "string" && field.optionFlows[val]) {
        const nested = traverseList(field.optionFlows[val], collectedMap, [...parentPath, field.questionId, val], [...parentOrderPath, fieldOrderStr]);
        if (nested.next) {
          if (nested.next.type === "file") {
            const parentFilesQuestionId = nested.path[nested.path.length - 2];
            const parentArray = field.optionFlows && field.optionFlows[val];
            if (parentArray) {
              const parentFilesField = parentArray.find(f => f.questionId === parentFilesQuestionId);
              if (parentFilesField) {
                const parentOrder = parentFilesField.order !== undefined ? String(parentFilesField.order) : String(parentFilesField.id || "");
                return { next: parentFilesField, path: [...parentPath, field.questionId, val, parentFilesField.questionId], orderPath: [...parentOrderPath, fieldOrderStr, parentOrder], remainingTopLevel };
              }
            }
          }
          return { next: nested.next, path: nested.path, orderPath: nested.orderPath, remainingTopLevel };
        }
        continue;
      }

      if (!basicComplete) {
        return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
      }
      continue;
    }

    // FORM — updated behavior:
    // - If parent not present -> return parent with all children
    // - If parent present but some required child missing -> return parent with only missing children (required + optionals missing)
    // - If all required children present -> continue (don't return parent)
    if (field.type === "form") {
      const parentObj = collectedMap.get(field.questionId);
      // if parent object entirely missing -> ask whole form
      if (!parentObj && (!basicComplete)) {
        // return parent so frontend can display all children
        return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
      }

      // If parent exists, check required children
      if (parentObj) {
        // find which children are missing or empty
        const missingChildren = (field.children || []).filter(child => {
          const childRawFromParent = parentObj && parentObj[child.questionId];
          const childFlat = collectedMap.has(child.questionId) ? collectedMap.get(child.questionId) : undefined;

          const presentInParent = childRawFromParent !== undefined && !isEmptyValue(childRawFromParent);
          const presentFlat = childFlat !== undefined && !isEmptyValue(childFlat);

          const satisfied = presentInParent || presentFlat;
          return !satisfied;
        });

        // Are any required children missing?
        const requiredMissing = missingChildren.some(ch => ch.required);

        if (requiredMissing) {
          // return parent form field, but include only missing children (so UI can show fields to fill)
          const fieldClone: Field = { ...field, children: missingChildren };
          return { next: fieldClone, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
        }

        // No required missing; treat as complete even if optional children are absent (per your rule)
        continue;
      }

      // If parent is present but basicComplete false (rare path), fall back to previous approach:
      if (!basicComplete) {
        if (field.children && field.children.length > 0) {
          for (const child of field.children) {
            const childOrderStr = child.order !== undefined ? String(child.order) : String(child.id || "");
            const parentObj2 = collectedMap.get(field.questionId);
            if (parentObj2 && parentObj2[child.questionId] !== undefined) {
              const val = unwrapPossibleWrapper(parentObj2[child.questionId]);
              const { ok } = validateTextField(val, child);
              if (!ok) return { next: child, path: [...parentPath, field.questionId, child.questionId], orderPath: [...parentOrderPath, fieldOrderStr, childOrderStr], remainingTopLevel };
              else continue;
            }
            if (collectedMap.has(child.questionId)) {
              const val = unwrapPossibleWrapper(collectedMap.get(child.questionId));
              const { ok } = validateTextField(val, child);
              if (!ok) return { next: child, path: [...parentPath, field.questionId, child.questionId], orderPath: [...parentOrderPath, fieldOrderStr, childOrderStr], remainingTopLevel };
              else continue;
            }
            if (child.required) {
              return { next: child, path: [...parentPath, field.questionId, child.questionId], orderPath: [...parentOrderPath, fieldOrderStr, childOrderStr], remainingTopLevel };
            }
          }
          continue;
        } else {
          if (!collectedMap.has(field.questionId)) {
            return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
          } else {
            continue;
          }
        }
      }

      continue;
    }

    // FILES handling (unchanged behavior)
    if (field.type === "files") {
      if (!basicComplete) {
        if (field.children && field.children.length > 0) {
          for (const child of field.children) {
            const childOrderStr = child.order !== undefined ? String(child.order) : String(child.id || "");
            const parentObj2 = collectedMap.get(field.questionId);

            const childPresent =
              (parentObj2 && parentObj2.mapping && parentObj2.mapping[child.questionId] && parentObj2.mapping[child.questionId].length > 0) ||
              (parentObj2 && parentObj2[child.questionId] !== undefined && !isEmptyValue(parentObj2[child.questionId])) ||
              (collectedMap.has(child.questionId) && !isEmptyValue(collectedMap.get(child.questionId)));

            if (!childPresent && child.required) {
              return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
            }
          }

          let anyPresent = false;
          for (const child of field.children) {
            const parentObj2 = collectedMap.get(field.questionId);
            if (parentObj2 && parentObj2.mapping && parentObj2.mapping[child.questionId] && parentObj2.mapping[child.questionId].length > 0) {
              anyPresent = true;
              break;
            }
            if (parentObj2 && parentObj2[child.questionId] !== undefined && !isEmptyValue(parentObj2[child.questionId])) {
              anyPresent = true;
              break;
            }
            if (collectedMap.has(child.questionId) && !isEmptyValue(collectedMap.get(child.questionId))) {
              anyPresent = true;
              break;
            }
          }
          if (!anyPresent) {
            return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
          }
          continue;
        } else {
          return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
        }
      }
      continue;
    }

    // SIMPLE text/file fields
    if (!basicComplete) {
      return { next: field, path: [...parentPath, field.questionId], orderPath: [...parentOrderPath, fieldOrderStr], remainingTopLevel };
    }
  }

  return { next: null, path: parentPath, orderPath: parentOrderPath, remainingTopLevel };
}

/* ---------------------------
   Public API
   --------------------------- */

export function getNextQuestion(formJson: FormJson, collected: CollectedItem[]): NextQuestionResult {
  const collectedMap = buildCollectedMap(collected || []);
  const topList = formJson.flow || [];

  const traversal = traverseList(topList, collectedMap, [], []);

  const remainingTopLevel = traversal.remainingTopLevel.filter((id) => {
    const f = (topList.find((t) => t.questionId === id) as Field) || null;
    if (!f) return true;
    return !isFieldComplete(f, collectedMap);
  });

  const nextOrder = traversal.orderPath && traversal.orderPath.length > 0 ? traversal.orderPath.join(":") : null;

  const isComplete = traversal.next === null;

  return {
    nextField: traversal.next,
    path: traversal.path,
    orderPath: traversal.orderPath,
    nextOrder,
    isComplete,
    remainingTopLevelIds: remainingTopLevel,
    completionMessage: isComplete ? formJson.completion : undefined,
  };
}
