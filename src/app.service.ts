import { Injectable } from '@nestjs/common';
import { IConversation, IMutation } from 'client/Types';
import { IInfoResponse } from './types';

@Injectable()
export class AppService {
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

  // TODO
  applyMutation(mutation: IMutation): { text: string } {
    console.log(mutation)
    return {
      text: '',
    };
  }

  // TODO
  getConversations(): IConversation[] {
    return [];
  }
}
