'use strict';

import { v1 } from 'uuid';
import Stream from 'observable-stream';
import {
  delay,
  keyIs,
  keyIsDisplayable,
  getRandomColor,
  promisifiedRAF,
  noOp,
} from './utils';
import { events } from '../events';

const port = window.location.port ? ':' + window.location.port : '';
const host = `${window.location.hostname}${port}`;
const socket = io.connect(host);
let textInputEl: HTMLTextAreaElement = null;
let userId = null;
let titleEl = null;
const activeUsers = new Map();
import { Reconcile } from './reconcile';
import { AUTHORS, OPERATIONTYPE } from './Types';

const keyIsEnter = keyIs('Enter');
const keyIsDelete = keyIs('Backspace');
let ReconcileAPI: Reconcile = null;

const delayShort = delay(1000);
const delayLong = delay(2000);
const delayTiny = delay(250);

socket.on(events.INFO, ({ id, connectedUsers }) => {
  userId = id;

  ReconcileAPI = new Reconcile(userId, v1(), function (content: string) {
    console.log(content);
    textInputEl.value = content;
  });

  connectedUsers
    .filter((user) => user !== userId)
    .forEach((user) => {
      addToActiveUsers({ userId: user });
    });
});

type Connection = { userId: string };
const $userConnection = new Stream<Connection>((observer) => {
  socket.on(events.USER_CONNECTED, observer.next);
  socket.on(events.USER_CONNECTED, observer.complete);
});

const $userDisconnection = new Stream<Connection>((observer) => {
  socket.on(events.USER_DISCONNETED, observer.next);
  socket.on(events.USER_DISCONNETED, observer.complete);
});

type EditorInsert = { from: AUTHORS; text: string; index: number };
const $editorInsert = new Stream<EditorInsert>((observer) => {
  socket.on(events.INSERT, observer.next);
  socket.on(events.DISCONNECT, observer.complete);
});

type EditorDelete = { from: AUTHORS; length: number; index: number };
const $editorDelete = new Stream<EditorDelete>((observer) => {
  socket.on(events.DELETE, observer.next);
  socket.on(events.DISCONNECT, observer.complete);
});

const $userTypingStart = new Stream((observer) => {
  socket.on(events.TYPING, observer.next);
  socket.on(events.TYPING, observer.complete);
});

const $userTypingStop = new Stream((observer) => {
  socket.on(events.STOPPED_TYPING, observer.next);
  socket.on(events.STOPPED_TYPING, observer.complete);
});

const $messageId = new Stream((observer) => {
  socket.on(events.MESSAGE_ID, observer.next);
});

/**
 * Appends the string to appropriate index
 * @param param0 { text, index }
 */
const enqueueInsert = ({ text, index }: EditorInsert): void => {
  if (text === undefined || text === null) return;

  ReconcileAPI.enqueueMutation({
    index,
    type: OPERATIONTYPE.Insert,
    text,
  });
};

/**
 * Deletes the string from appropriate index
 * @param param0 { length, index }
 */
const enqueueDelete = ({ length, index }: EditorDelete): void => {
  if (!length) return;

  ReconcileAPI.enqueueMutation({
    index,
    type: OPERATIONTYPE.Delete,
    length,
  });
};

const emitTyping = () => {
  socket.emit(events.TYPING, { userId });
};

const emitInsertEvent = ({ index, text, id }) => {
  socket.emit(events.INSERT, {
    from: userId,
    index,
    type: events.DELETE,
    text,
    id,
  });
};

const emitDeleteEvent = ({ index, length, id }) => {
  socket.emit(events.DELETE, {
    from: userId,
    index,
    type: events.DELETE,
    length,
    id,
  });
};

const addToActiveUsers = ({ userId }) => {
  if (activeUsers.has(userId)) return;

  const userEl = document.createElement('span');
  userEl.classList.add('user', 'u-float-right');
  userEl.style.backgroundColor = getRandomColor();

  activeUsers.set(userId, userEl);
};

const removeFromActiveUsers = ({ userId }) => {
  if (!activeUsers.has(userId)) return;

  activeUsers.get(userId).remove();
  activeUsers.delete(userId);
};

const startTyping = ({ userId }) => {
  if (!activeUsers.has(userId)) return;

  activeUsers.get(userId).classList.add('typing');
};

const stopTyping = ({ userId }) => {
  if (!activeUsers.has(userId)) return;

  activeUsers.get(userId).classList.remove('typing');
};

document.addEventListener('DOMContentLoaded', () => {
  titleEl = document.getElementById('title');
  textInputEl = document.getElementById('textInput') as HTMLTextAreaElement;

  const $textInput = Stream.fromEvent(
    'keydown',
    textInputEl,
  ) as Stream<KeyboardEvent>;

  promisifiedRAF()
    .then(delayLong)
    .then(() => titleEl.classList.add('u-fade'));

  textInputEl.focus();
  textInputEl.select();

  $userConnection.subscribe({
    next: addToActiveUsers,
    complete: noOp,
  });

  $userDisconnection.subscribe({
    next: removeFromActiveUsers,
    complete: noOp,
  });

  // insertion events
  let insertStart = null;
  $textInput
    .filter((e) => keyIsDisplayable(e.key) || keyIsEnter(e.key))
    .map((e) => {
      // HACK: implement pipe on Stream and use that instead
      if (insertStart === null) insertStart = textInputEl.selectionStart;
      return {
        e,
        id: v1(),
      };
    })
    .debounceTime(300) // accumulate keystrokes until the user stops for 300ms; should probably throttle instead
    .subscribe({
      next: ({ id, e }) => {
        e.preventDefault();
        const stringToInsert = textInputEl.value.substring(
          insertStart,
          textInputEl.selectionEnd,
        );

        ReconcileAPI.enqueueMutation({
          index: insertStart,
          type: OPERATIONTYPE.Insert,
          text: stringToInsert,
        });

        emitInsertEvent({
          index: insertStart,
          text: stringToInsert,
          id,
        });

        // CLEANUP
        insertStart = null;
      },
      complete: noOp,
    });

  let deleteStart = null;
  $textInput
    .filter((e) => keyIsDelete(e.code))
    .map((e) => {
      // HACK: implement pipe on Stream and use that instead
      if (deleteStart === null) deleteStart = textInputEl.selectionStart;

      return {
        e,
        id: v1(),
      };
    })
    .debounceTime(300)
    .subscribe({
      next: ({ id, e }) => {
        e.preventDefault();
        const lengthToDelete = deleteStart - textInputEl.selectionEnd;

        ReconcileAPI.enqueueMutation({
          index: deleteStart - lengthToDelete,
          type: OPERATIONTYPE.Delete,
          length: lengthToDelete,
        });

        emitDeleteEvent({
          index: deleteStart - lengthToDelete,
          length: lengthToDelete,
          id,
        });

        // CLEANUP
        deleteStart = null;
      },
      complete: noOp,
    });

  $editorInsert
    .filter(({ from }) => {
      return from !== userId;
    })
    .subscribe({
      next: enqueueInsert,
      complete: noOp,
    });

  $editorDelete
    .filter(({ from }) => {
      return from !== userId;
    })
    .subscribe({
      next: enqueueDelete,
      complete: noOp,
    });

  $userTypingStart.subscribe({
    next: startTyping,
    complete: noOp,
  });

  $userTypingStop.subscribe({
    next: stopTyping,
    complete: noOp,
  });
});
