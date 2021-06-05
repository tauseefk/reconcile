import { Logger } from '@nestjs/common'
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Socket, Server } from 'socket.io'
import { events } from '../events'
import { v1 } from 'uuid'
import { AUTHORS } from 'client/Types'

const debounce = (fn: Function, ms: number) => {
  let timer = null
  return (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn.bind(null, ...args), ms)
  }
}

@WebSocketGateway()
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  connectedUsers = [];

  d_stopTyping = debounce(({ socket, id }) => {
    socket.broadcast.emit(events.STOPPED_TYPING, { userId: id });
  }, 1000);

  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('AppGateway');

  @SubscribeMessage(events.INSERT)
  handleInsert(client: Socket, payload: any): void {
    if (Buffer.isBuffer(payload)) {
      try {
        payload = JSON.parse(payload.toString());
      } catch (e) {
        console.error(e);
        return;
      }
    }
    this.logger.log(payload);

    const updatedId = v1();
    client.broadcast.emit(events.INSERT, { ...payload, id: updatedId });
    client.emit(events.MESSAGE_ID, { ...payload, updatedId });
    client.broadcast.emit(events.STOPPED_TYPING, { userId: payload.author });
  }

  @SubscribeMessage(events.DELETE)
  handleDelete(client: Socket, payload: any): void {
    if (Buffer.isBuffer(payload)) {
      try {
        payload = JSON.parse(payload.toString());
      } catch (e) {
        console.error(e);
        return;
      }
    }
    this.logger.log(payload);

    const updatedId = v1();
    client.broadcast.emit(events.DELETE, { ...payload, id: updatedId });
    client.emit(events.MESSAGE_ID, { ...payload, updatedId });
    client.broadcast.emit(events.STOPPED_TYPING, { userId: payload.author });
  }

  @SubscribeMessage(events.TYPING)
  handleTyping(client: Socket): void {
    const userId = client.id;
    this.d_stopTyping({ socket: client, id: userId });
    client.broadcast.emit(events.TYPING, { author: userId });
  }

  @SubscribeMessage(events.EMPHASIZE_MESSAGE)
  handleEmphasize(client: Socket): void {
    client.broadcast.emit(events.EMPHASIZE_MESSAGE, { id: client.id });
  }

  afterInit(server: Server) {
    this.logger.log('init');
  }

  handleDisconnect(client: Socket) {
    const userId = client.id;
    this.logger.log(`Client disconnected: ${userId}`);

    this.connectedUsers = this.connectedUsers.filter((id) => id !== userId);
    client.broadcast.emit(events.USER_DISCONNETED, { userId });
  }

  handleConnection(client: Socket, ...args: any[]) {
    const author = Math.random() > 0.5 ? AUTHORS.ALICE : AUTHORS.BOB;
    this.logger.log(`Client connected: ${author}`);

    if (!this.connectedUsers.find((id) => id === client.id))
      this.connectedUsers.push(client.id);

    client.emit(events.INFO, {
      id: author,
      connectedUsers: this.connectedUsers,
    });

    client.broadcast.emit(events.USER_CONNECTED, { userId: author });
  }
}
