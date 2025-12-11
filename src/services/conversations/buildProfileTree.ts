// src/utils/buildProfileTree.ts
export interface CollectedItem {
  id: string;
  order?: string;       // e.g. "8" or "8:1" or "7:4:1"
  questionId: string;
  value: any;
}

export interface ProfileNode {
  id?: string;
  value?: any;
  children: Record<string, ProfileNode>;
}

/**
 * Build a nested tree keyed by questionId (fallback to order when missing).
 * Each node contains only { id?, value?, children }.
 */
export function buildProfileTree(collected: CollectedItem[]): Record<string, ProfileNode> {
  if (!Array.isArray(collected) || collected.length === 0) return {};

  // Map fullOrder -> internal node (temporarily hold questionId & order for remapping step)
  type TempNode = { order: string; questionId?: string; id?: string; value?: any; children: Record<string, TempNode> };
  const fullOrderMap = new Map<string, TempNode>();

  function ensureTempNode(fullOrder: string): TempNode {
    const existing = fullOrderMap.get(fullOrder);
    if (existing) return existing;

    const node: TempNode = {
      order: fullOrder,
      questionId: undefined,
      id: undefined,
      value: undefined,
      children: {}
    };
    fullOrderMap.set(fullOrder, node);

    const parts = fullOrder.split(':');
    if (parts.length > 1) {
      const parentOrder = parts.slice(0, parts.length - 1).join(':');
      const parent = ensureTempNode(parentOrder);
      // attach placeholder under parent's children keyed by the child's fullOrder for now
      parent.children[fullOrder] = node;
    }

    return node;
  }

  // 1) create temp nodes & fill metadata
  for (let i = 0; i < collected.length; i++) {
    const item = collected[i];
    if (!item.order || typeof item.order !== 'string') continue;
    const tn = ensureTempNode(item.order);
    tn.questionId = item.questionId;
    tn.id = item.id;
    tn.value = item.value;
  }

  // 2) remap children from fullOrder keys -> final keys (prefer questionId, else fallback to order)
  function remap(temp: TempNode) {
    const newChildren: Record<string, TempNode> = {};
    for (const k in temp.children) {
      if (!Object.prototype.hasOwnProperty.call(temp.children, k)) continue;
      const child = temp.children[k];
      // recurse first
      remap(child);
      const finalKey = (child.questionId && child.questionId.length > 0) ? child.questionId : child.order;
      newChildren[finalKey] = child;
    }
    temp.children = newChildren;
  }

  // 3) Build final result: top-level nodes are those whose fullOrder has no colon
  const result: Record<string, ProfileNode> = {};

  fullOrderMap.forEach((tempNode, fullOrder) => {
    if (fullOrder.indexOf(':') === -1) {
      // remap keys under this branch
      remap(tempNode);

      // convert branch to ProfileNode shape recursively
      function convert(t: TempNode): ProfileNode {
        const out: ProfileNode = { id: undefined, value: undefined, children: {} };
        if (t.id !== undefined) out.id = t.id;
        if (t.value !== undefined) out.value = t.value;

        for (const ck in t.children) {
          if (!Object.prototype.hasOwnProperty.call(t.children, ck)) continue;
          out.children[ck] = convert(t.children[ck]);
        }
        return out;
      }

      const topKey = (tempNode.questionId && tempNode.questionId.length > 0) ? tempNode.questionId : tempNode.order;
      result[topKey] = convert(tempNode);
    }
  });

  return result;
}
