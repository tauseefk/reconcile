import { delay, promisifiedRAF } from './utils';
import {
  AUTHORS,
  IMutation,
  IMutationData,
  OPERATIONTYPE,
  Origin,
} from './Types';

export const ping = () => {};
const delayHalfSec = delay(500);

// {
//   "author": "alice | bob",
//   "conversationId": "string",
//   "data": {
//     "index": "number",
//     "length": "number | undefined",
//     "text": "string | undefined",
//     "type": "insert | delete"
//   },
//   "origin": {
//     "alice": "integer",
//     "bob": "integer"
//   }
// }

interface ISnapShot {
  timestamp: Date;
  content: string; // assume single string for now
  mutations: IMutation[];
}

export type CursorOffset = { index: number; offset: number };

export type ContentUpdateCallback = (
  content: string,
  cursorOffsets: CursorOffset[],
) => void;

export class Reconcile {
  private mutationsQueue: IMutation[] = [];
  private content: string = '';
  private origin: Origin;
  private author: AUTHORS;
  private conversationId: string;
  private shouldUpdate: boolean = false;
  private cursorOffsets: CursorOffset[] = [];

  updateCallback: ContentUpdateCallback;

  constructor(
    author: AUTHORS,
    conversationId: string,
    updateCallback?: ContentUpdateCallback,
  ) {
    this.author = author;
    this.conversationId = conversationId;
    this.updateCallback = updateCallback;
    this.update();
  }

  enqueueMutation(data: IMutationData, author: AUTHORS) {
    this.shouldUpdate = true;

    this.mutationsQueue.push({
      data,
      author,
      conversationId: this.conversationId,
      origin: this.origin,
    });
  }

  update() {
    promisifiedRAF()
      .then(this.applyMutation.bind(this))
      .then(this.update.bind(this))
      .catch((e) => {
        console.error(e);
      });
  }

  private applyMutation() {
    if (this.mutationsQueue.length < 1) {
      if (this.shouldUpdate && this.updateCallback) {
        this.updateCallback(this.getDocumentState().content, [
          ...this.cursorOffsets,
        ]);

        this.cursorOffsets = [];
        this.shouldUpdate = false;
      }
      return;
    }

    const { data } = this.mutationsQueue[0];

    switch (data.type) {
      case OPERATIONTYPE.Insert:
        this.applyInsertion();
        break;
      case OPERATIONTYPE.Delete:
        this.applyDeletion();
        break;
      case OPERATIONTYPE.Undo:
        break;
      case OPERATIONTYPE.Redo:
        break;
    }
  }

  private applyInsertion() {
    const { content } = this;
    const { data } = this.mutationsQueue.shift();
    const { index, text } = data;

    this.content =
      content.substring(0, index) + text + content.substring(index);
  }

  private applyDeletion() {
    const { content } = this;
    const { data } = this.mutationsQueue.shift();
    const { index, length } = data;

    this.content =
      content.substring(0, index) + content.substring(index + length);
  }

  private createSnapshot() {}

  // only send on initialize for each user
  getDocumentState(): ISnapShot {
    return {
      timestamp: new Date(),
      content: this.content,
      mutations: this.mutationsQueue,
    };
  }
}
