import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { IConversation, IMutation } from 'client/Types';
import { MutationTransformer } from './MutationTransformer';
import { IInfoResponse } from './types';

@Injectable()
export class AppService {
  transformer: MutationTransformer = new MutationTransformer();
  conversationSnapshots: Map<string, IConversation> = new Map();

  getPing(): { msg: string } {
    return {
      msg: 'pong',
    };
  }

  getInfo(): IInfoResponse {
    // TODO: add answers here
    const answers = {
      1: `At first I thought the three questions were Leo Tolstoy's, however I read the instructions again.`,
      2: `answer 2 here`,
      3: `answer 3 here`,
    };
    return {
      author: {
        email: 'tauseef25@gmail.com',
        name: 'Md Tauseef',
      },
      frontend: {
        url: 'reconcile-txt.herokuapp.com',
      },
      language: 'node.js',
      sources: 'https://github.com/tauseefk/reconcile',
      answers: { ...answers },
    };
  }

  applyMutation(mutation: IMutation): { text: string } {
    const { conversationId } = mutation;
    this.transformer.enqueueMutation(mutation);

    const snapshot = this.transformer.getSnapshotFor(conversationId);

    // update snapshots map
    this.conversationSnapshots.set(conversationId, {
      id: conversationId,
      lastMutation: this.transformer.getLastMutationFor(conversationId),
      text: snapshot,
    });

    return {
      text: snapshot,
    };
  }

  getConversations(): { conversations: IConversation[] } {
    const snapshots = Array.from(this.conversationSnapshots.values());
    return { conversations: snapshots };
  }

  deleteConversation({ id }: { id: string }) {
    if (this.conversationSnapshots.has(id)) {
      this.conversationSnapshots.delete(id);
      this.transformer.deleteMutationStackFor(id);
    } else {
      throw new InternalServerErrorException('Conversation not found!');
    }
  }
}
