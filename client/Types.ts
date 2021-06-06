export enum OPERATIONTYPE {
  Insert = 'insert',
  Delete = 'delete',
  Undo = 'undo',
  Redo = 'redo',
}

export enum AUTHORS {
  ALICE = 'alice',
  BOB = 'bob',
}

export type Origin = {
  [value in AUTHORS]: number;
};

export interface IMutationData {
  index: number;
  length?: number;
  text?: string;
  type: OPERATIONTYPE;
}

export interface IMutation {
  author: AUTHORS;
  conversationId: string;
  data: IMutationData;
  origin: Origin;
}

export interface IConversation {
  id: string;
  lastMutation: IMutation;
  text: string;
}
