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
let author = null;
let titleEl = null;
const activeUsers = new Map();
import { CursorOffset, Reconcile } from './reconcile';
import { AUTHORS, OPERATIONTYPE } from './Types';

const keyIsEnter = keyIs('Enter');
const keyIsDelete = keyIs('Backspace');
let ReconcileAPI: Reconcile = null;

const delayShort = delay(1000);
const delayLong = delay(2000);

socket.on(events.INFO, ({ id, connectedUsers }) => {
  author = id;

  ReconcileAPI = new Reconcile(author, v1(), function (
    content: string,
    cursorOffsets: CursorOffset[],
  ) {
    let cursorPosition = textInputEl.selectionStart;
    textInputEl.value = content;

    cursorOffsets.forEach((off) => {
      if (off.index < cursorPosition) {
        console.log(off.index, off.offset);
        console.log(cursorPosition);
        cursorPosition += off.offset;
        console.log(cursorPosition);
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
  socket.on(events.USER_CONNECTED, observer.next);
  socket.on(events.USER_CONNECTED, observer.complete);
});

const $userDisconnection = new Stream<Connection>((observer) => {
  socket.on(events.USER_DISCONNETED, observer.next);
  socket.on(events.USER_DISCONNETED, observer.complete);
});

type EditorInsert = { author: AUTHORS; text: string; index: number };
const $editorInsert = new Stream<EditorInsert>((observer) => {
  socket.on(events.INSERT, observer.next);
  socket.on(events.DISCONNECT, observer.complete);
});

type EditorDelete = { author: AUTHORS; length: number; index: number };
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
const enqueueInsert = ({ author, text, index }: EditorInsert): void => {
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
const enqueueDelete = ({ author, length, index }: EditorDelete): void => {
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
  socket.emit(events.INSERT, {
    author: author,
    index,
    type: events.INSERT,
    text,
    id,
  });
};

const emitDeleteEvent = ({ index, length, id }) => {
  socket.emit(events.DELETE, {
    author: author,
    index,
    type: events.DELETE,
    length,
    id,
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

const startTyping = ({ author }) => {
  if (!activeUsers.has(author)) return;

  activeUsers.get(author).classList.add('typing');
};

const stopTyping = ({ author }) => {
  if (!activeUsers.has(author)) return;

  activeUsers.get(author).classList.remove('typing');
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
        }, author);

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
    .filter(e => {
      return e.author !== author;
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
