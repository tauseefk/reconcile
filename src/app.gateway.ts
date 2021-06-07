import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsResponse,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { EVENTS } from '../events';
import {
  AUTHORS,
  IMutation,
  IMutationData,
  OPERATIONTYPE,
  Origin,
} from 'client/Types';
import { MutationTransformer } from './MutationTransformer';

@WebSocketGateway()
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('AppGateway');
  private transformer: MutationTransformer = new MutationTransformer();

  connectedUsers = [];

  afterInit(server: Server) {
    this.logger.log('init');
  }

  @SubscribeMessage(EVENTS.INSERT)
  handleInsert(client: Socket, payload: IMutation): WsResponse<unknown> {
    this.logger.log(payload);
    const { conversationId } = payload;

    this.transformer.enqueueMutation(payload);

    const mutation = this.transformer.getLastMutationFor(conversationId);

    client.broadcast.emit(EVENTS.INSERT, { ...mutation });

    return {
      data: {
        ...mutation.data,
        origin: this.transformer.getOriginFor(conversationId),
      },
      event: EVENTS.ACK,
    };
  }

  @SubscribeMessage(EVENTS.DELETE)
  handleDelete(client: Socket, payload: IMutation): WsResponse<unknown> {
    this.logger.log(payload);
    const { conversationId } = payload;

    this.transformer.enqueueMutation(payload);

    const mutation = this.transformer.getLastMutationFor(conversationId);

    client.broadcast.emit(EVENTS.DELETE, { ...mutation });

    return {
      data: {
        ...mutation.data,
        origin: this.transformer.getOriginFor(conversationId),
      },
      event: EVENTS.ACK,
    };
  }

  handleDisconnect(client: Socket) {
    const userId = client.id;
    this.logger.log(`Client disconnected: ${userId}`);

    this.connectedUsers = this.connectedUsers.filter((id) => id !== userId);
    client.broadcast.emit(EVENTS.USER_DISCONNETED, { userId });
  }

  handleConnection(client: Socket, ...args: any[]) {
    const author = Math.random() > 0.5 ? AUTHORS.ALICE : AUTHORS.BOB;
    this.logger.log(`Client connected: ${author}`);

    if (!this.connectedUsers.find((id) => id === client.id))
      this.connectedUsers.push(client.id);

    client.emit(EVENTS.INFO, {
      id: author,
      connectedUsers: this.connectedUsers,
      origin: this.transformer.getOriginFor("1"),
    });

    client.broadcast.emit(EVENTS.USER_CONNECTED, { userId: author });
  }
}
