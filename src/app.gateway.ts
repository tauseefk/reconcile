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

@WebSocketGateway()
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('AppGateway');

  connectedUsers = [];
  docOrigin: Origin = { alice: 0, bob: 0 };
  mutationsStack: IMutation[] = [];

  afterInit(server: Server) {
    this.logger.log('init');
  }

  isOriginOlder(origin: Origin, cmpOrigin: Origin) {
    return cmpOrigin.alice >= origin.alice || cmpOrigin.bob >= origin.bob;
  }

  /**
   * If the origin of the new mutation is older than the current origin, pop the mutation stack until correct origin is found and combine.
   * @param mutation new mutation to compare against
   */
  transformMutation(mutation: IMutation): IMutationData {
    const { origin } = mutation;
    const tempMutationsStack: IMutation[] = [];
    let transformedMutationData: IMutationData = { ...mutation.data };

    let currentMutationFromStack = this.mutationsStack.pop();
    while (
      currentMutationFromStack &&
      this.isOriginOlder(origin, currentMutationFromStack.origin)
    ) {
      tempMutationsStack.push(currentMutationFromStack);
      currentMutationFromStack = this.mutationsStack.pop();
    }

    while (tempMutationsStack.length) {
      const m = tempMutationsStack.pop();

      if (m.author === mutation.author) continue;

      const { data } = m;
      if (data.index <= mutation.data.index)
        transformedMutationData = this.applyTransform(
          transformedMutationData,
          data,
        );

      this.mutationsStack.push(m); // push mutations back to the original stack
    }

    return transformedMutationData;
  }

  /**
   * @param a new mutation
   * @param b mutation to compare against
   * @returns
   */
  applyTransform(a: IMutationData, b: IMutationData): IMutationData {
    switch (b.type) {
      case OPERATIONTYPE.Insert:
        return { ...a, index: a.index + b.text.length };
      case OPERATIONTYPE.Delete:
        return { ...a, index: a.index - b.length };
      default:
        return a;
    }
  }

  updateOrigin(author: AUTHORS) {
    const { alice, bob } = this.docOrigin;

    if (author === AUTHORS.ALICE) this.docOrigin = { alice: alice + 1, bob };
    if (author === AUTHORS.BOB) this.docOrigin = { alice, bob: bob + 1 };
  }

  @SubscribeMessage(EVENTS.INSERT)
  handleInsert(client: Socket, payload: IMutation): WsResponse<unknown> {
    this.logger.log(payload);

    const { origin } = payload;
    let { data } = payload;
    let currentMutationFromStack =
      this.mutationsStack[this.mutationsStack.length - 1];

    // if Origins mismatch; apply transformations
    if (
      currentMutationFromStack &&
      this.isOriginOlder(origin, currentMutationFromStack.origin)
    ) {
      data = { ...this.transformMutation(payload) };
    }

    payload = {
      author: payload.author,
      conversationId: '1',
      data: { ...data },
      origin: this.docOrigin,
    };

    this.mutationsStack.push(payload);

    this.updateOrigin(payload.author);

    client.broadcast.emit(EVENTS.INSERT, { ...payload });

    return { data: { ...data, origin: this.docOrigin }, event: EVENTS.ACK };
  }

  @SubscribeMessage(EVENTS.DELETE)
  handleDelete(client: Socket, payload: IMutation): WsResponse<unknown> {
    this.logger.log(payload);

    const { origin } = payload;
    let { data } = payload;
    let currentMutationFromStack =
      this.mutationsStack[this.mutationsStack.length - 1];

    // if Origins mismatch; apply transformations
    if (
      currentMutationFromStack &&
      this.isOriginOlder(origin, currentMutationFromStack.origin)
    )
      data = { ...this.transformMutation(payload) };

    payload = {
      author: payload.author,
      conversationId: '1',
      data: { ...data },
      origin: this.docOrigin,
    };

    this.mutationsStack.push(payload);

    this.updateOrigin(payload.author);

    client.broadcast.emit(EVENTS.DELETE, { ...payload });

    return { data: { ...data, origin: this.docOrigin }, event: EVENTS.ACK };
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
      origin: this.docOrigin,
    });

    client.broadcast.emit(EVENTS.USER_CONNECTED, { userId: author });
  }
}
