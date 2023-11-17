import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

import { RoomManager } from './models/room-manager';

const app = express();
const server = createServer(app);

export type WebSocketBody<T extends object = object> = {
  type: 'create' | 'join' | 'leave' | 'ready' | 'start' | 'update';
  params: T;
};

export type EventParams<T extends 'create' | null = null> = {
  playerId: string;
} & (T extends 'create' ? Record<string, never> : Record<'roomId', string>);

app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const wss = new WebSocketServer({ server });

const roomsManager = new RoomManager(wss);

wss.on('connection', function connection(ws) {
  setInterval(() => {
    ws.ping();
  }, 25000);

  console.info('connected');
  ws.on('error', console.error);

  ws.on('message', function message(rawData: string) {
    try {
      const data = JSON.parse(rawData) as WebSocketBody<EventParams>;
      console.log('data', data);
      const type = data.type;
      const params = data.params;

      const handlers = {
        create,
        join,
        ready,
        leave,
      };

      const eventHandler = handlers[type] ?? defaultHandler(type);

      eventHandler(ws, params);
    } catch (error) {
      const err = error as Error;

      if (err instanceof Error) {
        send(ws, {
          type: 'error',
          params: {
            message: err.message,
          },
        });
        console.warn(err.message);
        return;
      }

      send(ws, {
        type: 'error',
        params: { error },
      });
      console.warn(error);
    }
  });
});

function defaultHandler(type) {
  throw Error(`Type: ${type} unknown`);
}

function create(ws: WebSocket, { playerId }: EventParams<'create'>) {
  const room = roomsManager.createRoom(ws, playerId);

  room.getPlayer(playerId).send({
    type: 'create',
    params: {
      roomId: room.getId(),
    },
  });
}

function join(ws: WebSocket, { playerId, roomId }: EventParams) {
  const room = roomsManager.getRoom(roomId);

  room.sendToRoom({ type: 'join', params: { playerId } }, playerId);
}

function ready(ws: WebSocket, { playerId, roomId }: EventParams) {
  const room = roomsManager.getRoom(roomId);

  room.getPlayer(playerId).setPlayerReady();

  room.sendToRoom({ type: 'ready', params: { playerId } }, playerId);

  if (room.isAllPlayerReady()) {
    room.sendToRoom({ type: 'start', params: { startTime: Date.now() } });

    setInterval(() => {
      room.sendToRoom({ type: 'update', params: { data: [] } });
    }, 1000);
  }
}
function leave(ws: WebSocket, { playerId, roomId }: EventParams) {
  const room = roomsManager.getRoom(roomId);

  room.removePlayer(playerId);

  room.sendToRoom({ type: 'leave', params: { playerId } }, playerId);

  ws.close();
}

function send(ws, params: object) {
  ws.send(JSON.stringify(params));
}

app.post('/init', (req, res) => {
  const playerName = req.body.name;
  const gameComplexity = req.body.complexity;

  res.json({ playerName, gameComplexity });
});

const start = async () => {
  try {
    server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  } catch (e) {
    console.log(e);
  }
};

start();
