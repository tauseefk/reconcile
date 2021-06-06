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
import { EVENTS } from '../events';

const port = window.location.port ? ':' + window.location.port : '';
const host = `${window.location.hostname}${port}`;
const socket = io.connect(host);
let textInputEl: HTMLTextAreaElement = null;
let author = null;
let titleEl = null;
const activeUsers = new Map();
import { CursorOffset, Reconcile } from './Reconcile';
import { AUTHORS, IMutation, OPERATIONTYPE, Origin } from './Types';

const keyIsEnter = keyIs('Enter');
const keyIsDelete = keyIs('Backspace');
let ReconcileAPI: Reconcile = null;
let docOrigin: Origin;

const delayShort = delay(1000);
const delayLong = delay(2000);

socket.on(EVENTS.INFO, ({ id, connectedUsers, origin }) => {
  author = id;
  docOrigin = origin;

  ReconcileAPI = new Reconcile(author, v1(), function (
    content: string,
    cursorOffsets: CursorOffset[],
  ) {
    let cursorPosition = textInputEl.selectionStart;
    textInputEl.value = content;

    cursorOffsets.forEach((off) => {
      if (off.index < cursorPosition) {
        cursorPosition += off.offset;
      }
    });

    textInputEl.setSelectionRange(cursorPosition, cursorPosition);
  });

  connectedUsers
    .filter((user) => user !== author)
    .forEach((user) => {
      addToActiveUsers({ author: user });
    });
});

type Connection = { author: string };
const $userConnection = new Stream<Connection>((observer) => {
  socket.on(EVENTS.USER_CONNECTED, observer.next);
  socket.on(EVENTS.USER_CONNECTED, observer.complete);
});

const $userDisconnection = new Stream<Connection>((observer) => {
  socket.on(EVENTS.USER_DISCONNETED, observer.next);
  socket.on(EVENTS.USER_DISCONNETED, observer.complete);
});

const $editorInsert = new Stream<IMutation>((observer) => {
  socket.on(EVENTS.INSERT, observer.next);
  socket.on(EVENTS.DISCONNECT, observer.complete);
});

const $editorDelete = new Stream<IMutation>((observer) => {
  socket.on(EVENTS.DELETE, observer.next);
  socket.on(EVENTS.DISCONNECT, observer.complete);
});

const $editorAck = new Stream<unknown>((observer) => {
  socket.on(EVENTS.ACK, observer.next);
  socket.on(EVENTS.ACK, observer.complete);
});

/**
 * Appends the string to appropriate index
 * @param param0 { text, index }
 */
const enqueueInsert = (x: IMutation): void => {
  const { author, data, origin } = x;
  const { text, index } = data;

  docOrigin = origin;
  if (text === undefined || text === null) return;

  ReconcileAPI.enqueueMutation(
    {
      index,
      type: OPERATIONTYPE.Insert,
      text,
    },
    author,
  );
};

/**
 * Deletes the string from appropriate index
 * @param param0 { length, index }
 */
const enqueueDelete = ({ author, data, origin }: IMutation): void => {
  const { length, index } = data;
  docOrigin = origin;
  if (!length) return;

  ReconcileAPI.enqueueMutation(
    {
      index,
      type: OPERATIONTYPE.Delete,
      length,
    },
    author,
  );
};

const emitInsertEvent = ({ index, text, id }) => {
  socket.emit(EVENTS.INSERT, {
    author: author,
    id,
    data: {
      index,
      type: EVENTS.INSERT,
      text,
    },
    origin: docOrigin,
  });
};

const emitDeleteEvent = ({ index, length, id }) => {
  socket.emit(EVENTS.DELETE, {
    author: author,
    data: {
      index,
      type: EVENTS.DELETE,
      length,
    },
    id,
    origin: docOrigin,
  });
};

const addToActiveUsers = ({ author }) => {
  if (activeUsers.has(author)) return;

  const userEl = document.createElement('span');
  userEl.classList.add('user', 'u-float-right');
  userEl.style.backgroundColor = getRandomColor();

  activeUsers.set(author, userEl);
};

const removeFromActiveUsers = ({ author }) => {
  if (!activeUsers.has(author)) return;

  activeUsers.get(author).remove();
  activeUsers.delete(author);
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
    .then(() => titleEl.classList.add('u-fade'))
    .then(delayShort)
    .then(() => (titleEl.style.display = 'none'));

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
    .debounceTime(2000) // accumulate keystrokes until the user stops for 300ms; should probably throttle instead
    .subscribe({
      next: ({ id, e }) => {
        e.preventDefault();
        const stringToInsert = textInputEl.value.substring(
          insertStart,
          textInputEl.selectionEnd,
        );

        ReconcileAPI.enqueueMutation(
          {
            index: insertStart,
            type: OPERATIONTYPE.Insert,
            text: stringToInsert,
          },
          author,
        );

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
    .debounceTime(2000)
    .subscribe({
      next: ({ id, e }) => {
        e.preventDefault();
        const lengthToDelete = deleteStart - textInputEl.selectionEnd;

        ReconcileAPI.enqueueMutation(
          {
            index: deleteStart - lengthToDelete,
            type: OPERATIONTYPE.Delete,
            length: lengthToDelete,
          },
          author,
        );

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
    .filter((e) => {
      return e.author !== author;
    })
    .subscribe({
      next: enqueueInsert,
      complete: noOp,
    });

  $editorDelete
    .filter((e) => {
      return e.author !== author;
    })
    .subscribe({
      next: enqueueDelete,
      complete: noOp,
    });

  $editorAck.subscribe({
    next: ({ origin }) => {
      docOrigin = { ...origin };
    }, // TODO: update origin here
    complete: noOp,
  });
});
