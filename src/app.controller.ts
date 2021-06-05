import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('api/v0')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/ping')
  getPing(): { msg: string } {
    return this.appService.getPing();
  }
}
