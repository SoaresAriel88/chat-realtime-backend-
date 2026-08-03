import { io } from 'socket.io-client';
import * as readline from 'node:readline';

type SendMessagePayload = {
  room: string;
  authorId: string;
  content: string;
};

type NewMessagePayload = {
  room: string;
  author: string;
  content: string;
  createdAt?: string | Date;
};

type SocketAckResponse = {
  success: boolean;
  message: string;
  room?: {
    id: string;
    name: string;
  };
};

type SocketTypingPayload = {
  room: string;
  author: string;
};

type CurrentRoom = {
  id: string;
  name: string;
};

const username = 'Ariel';

const userId = '0ac5e452-59f4-485d-b2d6-fad991fbfc8f';

let currentRoom: CurrentRoom | null = null;

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function showMenu() {
  console.log('\n--- CHAT REAL TIME ---');
  console.log('Comandos disponíveis:');
  console.log('/create nome-da-sala  -> cria uma sala');
  console.log('/join nome-da-sala    -> entra em uma sala');
  console.log(
    '/leave nome-da-sala   -> sai da sala atual ou da sala informada',
  );
  console.log('/room                 -> mostra a sala atual');
  console.log('/help                 -> mostra os comandos');
  console.log('/exit                 -> sair do client');
  console.log(
    '\nDepois de entrar em uma sala, digite uma mensagem normalmente.\n',
  );
}

function updateCurrentRoom(roomName: string, response: SocketAckResponse) {
  if (!response.room?.id || !response.room.name) {
    console.log('O servidor não retornou o ID da sala.');
    console.log('Verifique se o Gateway retorna room: { id, name }.');
    return;
  }

  currentRoom = {
    id: response.room.id,
    name: response.room.name || roomName,
  };
}

function getCurrentRoomId(): string | null {
  if (!currentRoom) {
    return null;
  }

  return currentRoom.id;
}

showMenu();

socket.on('connect', () => {
  console.log(`Conectado como ${username}`);
  console.log('Socket ID:', socket.id);
  console.log('Digite /create nome-da-sala ou /join nome-da-sala');
});

socket.on('chat:new_message', (data: NewMessagePayload) => {
  const createdAt = data.createdAt
    ? new Date(data.createdAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const timePrefix = createdAt ? `[${createdAt}] ` : '';

  console.log(`\n${timePrefix}${data.author}: ${data.content}`);
});

socket.on('chat:user_typing', (data: SocketTypingPayload) => {
  if (data.author === username) {
    return;
  }

  console.log(`\n${data.author} está digitando...`);
});

socket.on('chat:user_stop_typing', (data: SocketTypingPayload) => {
  if (data.author === username) {
    return;
  }

  console.log(`\n${data.author} parou de digitar.`);
});

socket.on('disconnect', () => {
  console.log('Desconectado do socket');
});

socket.on('connect_error', (error: Error) => {
  console.log('Erro ao conectar:', error.message);
});

rl.on('line', (message) => {
  const text = message.trim();

  if (!text) {
    console.log('Mensagem vazia não enviada.');
    return;
  }

  if (text === '/help') {
    showMenu();
    return;
  }

  if (text === '/room') {
    if (!currentRoom) {
      console.log('Você ainda não está em nenhuma sala.');
      return;
    }

    console.log(`Sala atual: ${currentRoom.name}`);
    console.log(`ID da sala atual: ${currentRoom.id}`);
    return;
  }

  if (text === '/exit') {
    console.log('Saindo do chat...');
    rl.close();
    socket.disconnect();
    process.exit(0);
  }

  if (text.startsWith('/create ')) {
    const roomName = text.replace('/create ', '').trim();

    if (!roomName) {
      console.log('Informe o nome da sala. Exemplo: /create estudos');
      return;
    }

    socket.emit(
      'chat:create_room',
      { name: roomName },
      (response: SocketAckResponse) => {
        console.log(response.message);

        if (response.success) {
          updateCurrentRoom(roomName, response);

          if (currentRoom) {
            console.log(`Sala atual definida como: ${currentRoom.name}`);
          }
        }
      },
    );

    return;
  }

  if (text.startsWith('/join ')) {
    const roomName = text.replace('/join ', '').trim();

    if (!roomName) {
      console.log('Informe o nome da sala. Exemplo: /join estudos');
      return;
    }

    socket.emit(
      'chat:join_room',
      { name: roomName },
      (response: SocketAckResponse) => {
        console.log(response.message);

        if (response.success) {
          updateCurrentRoom(roomName, response);

          if (currentRoom) {
            console.log(`Sala atual definida como: ${currentRoom.name}`);
          }
        }
      },
    );

    return;
  }

  if (text.startsWith('/leave')) {
    const roomNameFromCommand = text.replace('/leave', '').trim();
    const roomName = roomNameFromCommand || currentRoom?.name;

    if (!roomName) {
      console.log(
        'Você precisa informar uma sala ou estar dentro de uma sala.',
      );
      console.log('Exemplo: /leave estudos');
      return;
    }

    socket.emit(
      'chat:leave_room',
      { name: roomName },
      (response: SocketAckResponse) => {
        console.log(response.message);

        if (response.success && currentRoom?.name === roomName) {
          currentRoom = null;
          console.log('Você não está mais em nenhuma sala.');
        }
      },
    );

    return;
  }

  const roomId = getCurrentRoomId();

  if (!roomId) {
    console.log('Você precisa entrar em uma sala antes de enviar mensagem.');
    console.log('Use /create nome-da-sala ou /join nome-da-sala.');
    return;
  }

  if (!userId.trim()) {
    console.log(
      'Você precisa configurar o userId real no arquivo chat-client.ts.',
    );
    return;
  }

  const payload: SendMessagePayload = {
    room: roomId,
    authorId: userId,
    content: text,
  };

  const typingPayload: SocketTypingPayload = {
    room: roomId,
    author: username,
  };

  socket.emit('chat:typing_start', typingPayload);

  socket.emit('chat:send_message', payload, (response: SocketAckResponse) => {
    socket.emit('chat:typing_stop', typingPayload);

    if (!response.success) {
      console.log(`Erro: ${response.message}`);
      return;
    }

    console.log(response.message);
  });
});
