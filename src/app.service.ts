import {
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
      1: `At first I thought the three questions were Leo Tolstoy's, however I read the instructions again.\
      \nI anticipated that getting the algorithm implemented properly was going to take most of the time.\
      So I started with creating the realtime doc viewer, similar to google docs. It turned out to be fascinating, \
      managing cursor positions correctly is difficult. Then I spent some time scaffolding the BE api repo so make it easier to develop on top of.\
      Lastly I spent some time working on the Frontend for the conversations viewer.`,
      2: `If I could spend more time I'd work on unifying the frontend, and the last test suite for the algorithm. I still have a bug when multiple mutations are out of order and interdependent.`,
      3: `I wish there was a recommended time to be spent on each part, however estimation and time management is part of the challenge when engineering software so it makes sense to be open-ended.`,
    };
    return {
      author: {
        email: 'tauseef25@gmail.com',
        name: 'Md Tauseef',
      },
      frontend: {
        url: 'reconcile-ui.herokuapp.com',
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
