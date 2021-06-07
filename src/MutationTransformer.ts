import {
  Origin,
  IMutation,
  IMutationData,
  OPERATIONTYPE,
  AUTHORS,
} from 'client/Types';

export class MutationTransformer {
  private docOriginMap: Map<string, Origin> = new Map();
  private mutationStackMap: Map<string, IMutation[]> = new Map();

  private getMutationStackFor(conversationId: string): IMutation[] {
    return this.mutationStackMap.has(conversationId)
      ? [...this.mutationStackMap.get(conversationId)]
      : [];
  }

  getOriginFor(conversationId: string) {
    return this.docOriginMap.has(conversationId)
      ? { ...this.docOriginMap.get(conversationId) }
      : { alice: 0, bob: 0 };
  }

  private setMutationStackFor(
    conversationId: string,
    mutationsStack: IMutation[],
  ) {
    this.mutationStackMap.set(conversationId, mutationsStack);
  }

  private isOriginConflicting(origin: Origin, cmpOrigin: Origin) {
    return origin.alice <= cmpOrigin.alice && origin.bob <= cmpOrigin.bob;
  }

  /**
   * If the origin of the new mutation is older than the current origin, pop the mutation stack until correct origin is found and combine.
   * @param mutation new mutation to compare against
   */
  private transformMutation(mutation: IMutation): IMutationData {
    const { origin } = mutation;
    const tempMutationsStack: IMutation[] = [];
    const currentMutationStack = this.getMutationStackFor(
      mutation.conversationId,
    );

    let transformedMutationData: IMutationData = { ...mutation.data };

    let currentMutationFromStack = currentMutationStack.pop();
    while (
      currentMutationFromStack &&
      this.isOriginConflicting(origin, currentMutationFromStack.origin)
    ) {
      tempMutationsStack.push(currentMutationFromStack);
      currentMutationFromStack = currentMutationStack.pop();
    }

    while (tempMutationsStack.length) {
      const m = tempMutationsStack.pop();

      if (m.author === mutation.author) continue;

      const { data } = m;
      if (data.index <= mutation.data.index)
        transformedMutationData = this.applyTransform(
          transformedMutationData,
          data,
        );
    }

    return transformedMutationData;
  }

  /**
   * @param a new mutation
   * @param b mutation to compare against
   * @returns
   */
  private applyTransform(a: IMutationData, b: IMutationData): IMutationData {
    switch (b.type) {
      case OPERATIONTYPE.Insert:
        return { ...a, index: a.index + b.text.length };
      case OPERATIONTYPE.Delete:
        return { ...a, index: a.index - b.length };
      default:
        return a;
    }
  }

  private updateOriginFor(conversationId: string, author: AUTHORS) {
    const { alice, bob } = this.getOriginFor(conversationId);
    if (author === AUTHORS.ALICE)
      this.docOriginMap.set(conversationId, { alice: alice + 1, bob });
    if (author === AUTHORS.BOB)
      this.docOriginMap.set(conversationId, { alice, bob: bob + 1 });
  }

  private applyInsertion(mutation: IMutation, content: string) {
    const { data } = mutation;
    const { index, text } = data;

    return content.substring(0, index) + text + content.substring(index);
  }

  private applyDeletion(mutation: IMutation, content: string) {
    const { data } = mutation;
    const { index, length } = data;

    return content.substring(0, index) + content.substring(index + length);
  }

  enqueueMutation(payload: IMutation): void {
    const { author, conversationId } = payload;
    const currentMutationStack = this.getMutationStackFor(conversationId);

    const data = { ...this.transformMutation(payload) };

    currentMutationStack.push({
      author: author,
      conversationId: conversationId,
      data: { ...data },
      origin: this.getOriginFor(conversationId),
    });

    this.updateOriginFor(conversationId, author);
    this.setMutationStackFor(conversationId, currentMutationStack); // set mutation stack back on the map
  }

  getSnapshotFor(conversationId: string) {
    const mutationsList = this.getMutationStackFor(conversationId);
    let content = '';

    mutationsList.forEach((m) => {
      if (m.data.type === OPERATIONTYPE.Insert) {
        content = this.applyInsertion(m, content);
      } else if (m.data.type === OPERATIONTYPE.Delete) {
        content = this.applyDeletion(m, content);
      }
    });

    return content;
  }

  getLastMutationFor(conversationId: string) {
    const mutationsList = this.getMutationStackFor(conversationId);
    return mutationsList[mutationsList.length - 1];
  }
}
