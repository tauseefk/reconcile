import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { IConversation, IMutation } from 'client/Types';
import { AppService } from './app.service';
import { IInfoResponse } from './types';

@Controller('api/v0')
export class AppController {
  private logger: Logger = new Logger('AppController');
  constructor(private readonly appService: AppService) {}

  @Get('/ping')
  getPing(): { msg: string } {
    return this.appService.getPing();
  }

  @Get('/info')
  getInfo(): IInfoResponse {
    return this.appService.getInfo();
  }

  @Post('/mutations')
  applyMutation(@Body() mutation: IMutation): { text: string } {
    const { data, origin } = mutation;
    if (!data || !origin)
      throw new BadRequestException(`Mutation payload ${mutation} is invalid.`);

    return this.appService.applyMutation(mutation);
  }

  @Get('/conversations')
  getConversations(): { conversations: IConversation[] } {
    return this.appService.getConversations();
  }

  @Delete('conversations/:id')
  deleteConversationById(@Param('id') id: string): void {
    try {
      this.appService.deleteConversation({
        id,
      });
    } catch (e) {
      throw new BadRequestException(`Conversation doesn't exist!`);
    }
  }
}
