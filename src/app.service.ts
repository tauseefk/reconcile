import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getPing(): { msg: string } {
    return {
      msg: 'pong',
    };
  }
}
