import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { SendMessagePayload } from './types/send-message-payload.type';
import { ChatService } from './chat.service';
import { PrismaService } from 'src/database/prisma.service';
import { NotificationService } from 'src/notification/notification.service';

type SocketAckResponse = {
  success: boolean;
  message: string;
  room?: {
    id: string;
    name: string;
    tenantId: string;
  };
};

type SocketTypingStart = {
  room: string;
  tenantId: string;
  author: string;
};

type JwtPayload = {
  sub: string;
  email: string;
  tenantId: string;
};

type AuthenticatedSocketUser = {
  id: string;
  name: string;
  email: string;
  tenantId: string;
};

type OnlineUser = {
  id: string;
  name: string;
  tenantId: string;
  status: 'online';
};

type OnlineUserWithSockets = OnlineUser & {
  socketIds: Set<string>;
};

@WebSocketGateway({
  transports: ['websocket'],
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly onlineUsersByRoom = new Map<
    string,
    Map<string, OnlineUserWithSockets>
  >();

  private readonly roomsBySocket = new Map<string, Set<string>>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async handleConnection(client: Socket) {
    const token = this.extractTokenFromSocket(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET!,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub, tenantId: payload.tenantId },
        select: { id: true, tenantId: true, name: true },
      });

      if (!user) {
        client.disconnect(true);
        return;
      }

      client.data.user = {
        id: user.id,
        name: user.name,
        email: payload.email,
        tenantId: payload.tenantId,
      } satisfies AuthenticatedSocketUser;

      // NOVO: entra na room global do tenant
      await client.join(`tenant:${payload.tenantId}`);

      console.log(`Cliente conectado: ${client.id} - ${user.name}`);
    } catch (error) {
      console.log('Token inválido no socket:', error);
      client.disconnect(true);
    }
  }
  handleDisconnect(client: Socket) {
    this.removeSocketFromAllRooms(client);

    console.log('Cliente desconectado:', client.id);
  }

  @SubscribeMessage('chat:create_room')
  async handleCreateRoom(
    @MessageBody() data: { name?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAckResponse> {
    const currentUser = this.getAuthenticatedUser(client);

    if (!currentUser) {
      return {
        success: false,
        message: 'Usuário não autenticado',
      };
    }
    const tenantId = currentUser.tenantId;
    if (!tenantId) {
      return {
        success: false,
        message: 'Tenant não encontrado',
      };
    }

    const roomName = data.name?.trim();

    if (!roomName) {
      return {
        success: false,
        message: 'Nome da sala é obrigatório',
      };
    }

    const room = await this.chatService.roomCreate({
      name: roomName,
      tenantId,
    });
    const roomId: string = room.id;

    await client.join(roomId);

    this.addOnlineUserToRoom(roomId, client);
    this.emitOnlineUsers(roomId);

    this.server.to(`tenant:${tenantId}`).emit('chat:room_created', {
      id: room.id,
      name: room.name,
      tenantId: room.tenantId,
    });

    console.log(`Acesso a tenant com sucesso: ${tenantId}`);
    console.log(`Sala criada com sucesso: ${room.name}`);
    console.log(`Cliente ${client.id} entrou na sala ID: ${room.id}`);

    return {
      success: true,
      message: `Sala ${room.name} criada com sucesso`,
      room: {
        id: room.id,
        name: room.name,
        tenantId: room.tenantId,
      },
    };
  }

  @SubscribeMessage('chat:join_room')
  async handleJoinRoom(
    @MessageBody() data: { room?: string; name?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAckResponse> {
    const currentUser = this.getAuthenticatedUser(client);

    if (!currentUser) {
      return {
        success: false,
        message: 'Usuário não autenticado',
      };
    }
    const tenantId = currentUser.tenantId;
    if (!tenantId) {
      return {
        success: false,
        message: 'Tenant não encontrado',
      };
    }
    console.log('JOIN BACKEND DEBUG:', {
      data,
      room: data.room,
      name: data.name,
      tenantId,
      currentUser,
    });

    const roomIdentifier = data.room?.trim() || data.name?.trim();

    if (!roomIdentifier) {
      return {
        success: false,
        message: 'Sala não informada',
      };
    }

    const room = await this.chatService.findRoomByIdOrName(
      roomIdentifier,
      tenantId,
    );

    if (!room) {
      return {
        success: false,
        message: 'Sala não encontrada',
      };
    }

    await client.join(room.id);
    const socketsInRoom = await this.server.in(room.id).fetchSockets();

    console.log('SOCKETS NA ROOM DEPOIS DO JOIN:', {
      roomId: room.id,
      total: socketsInRoom.length,
      users: socketsInRoom.map((socket) => socket.data.user),
    });

    this.addOnlineUserToRoom(room.id, client);
    this.emitOnlineUsers(room.id);

    await this.chatService.addParticipant({
      conversationId: room.id,
      userId: currentUser.id,
      tenantId,
    });

    console.log(`Acesso a tenant com sucesso: ${tenantId}`);
    console.log(`Cliente ${client.id} entrou na sala ${room.name}`);
    console.log(`Room ID usada no socket: ${room.id}`);
    console.log('JOIN ROOM DEBUG:', {
      roomIdentifier,
      tenantId,
      user: currentUser,
    });

    return {
      success: true,
      message: `Entrou na sala ${room.name}`,
      room: {
        id: room.id,
        name: room.name,
        tenantId: room.tenantId,
      },
    };
  }

  @SubscribeMessage('chat:leave_room')
  async handleLeaveRoom(
    @MessageBody() data: { room?: string; name?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAckResponse> {
    const currentUser = this.getAuthenticatedUser(client);

    if (!currentUser) {
      return {
        success: false,
        message: 'Usuário não autenticado',
      };
    }
    const tenantId = currentUser.tenantId;
    if (!tenantId) {
      return {
        success: false,
        message: 'Tenant não encontrado',
      };
    }
    const roomIdentifier = data.room?.trim() || data.name?.trim();
    if (!roomIdentifier) {
      return {
        success: false,
        message: 'Sala não informada',
      };
    }

    const room = await this.chatService.findRoomByIdOrName(
      roomIdentifier,
      tenantId,
    );

    if (!room) {
      return {
        success: false,
        message: 'Sala não encontrada',
      };
    }
    console.log('LEAVE ROOM DEBUG:', {
      roomRecebida: data.room,
      tenantId,
      currentUser,
    });

    await client.leave(room.id);

    const socketsInRoom = await this.server.in(room.id).fetchSockets();

    console.log('SOCKETS NA ROOM DEPOIS DO LEAVE:', {
      roomId: room.id,
      total: socketsInRoom.length,
      users: socketsInRoom.map((socket) => socket.data.user),
    });

    this.removeOnlineUserFromRoom(room.id, client);
    this.emitOnlineUsers(room.id);

    console.log(`Cliente ${client.id} saiu da sala ${room.name}`);
    console.log(`Room ID removida do socket: ${room.id}`);

    return {
      success: true,
      message: `Saiu da sala ${room.name}`,
      room: {
        id: room.id,
        name: room.name,
        tenantId: room.tenantId,
      },
    };
  }

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @MessageBody() data: SendMessagePayload,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAckResponse> {
    const currentUser = this.getAuthenticatedUser(client);

    if (!currentUser) {
      return {
        success: false,
        message: 'Usuário não autenticado',
      };
    }
    const tenantId = currentUser.tenantId;
    if (!tenantId) {
      return {
        success: false,
        message: 'Tenant não encontrado',
      };
    }

    const room = data.room?.trim();
    const content = data.content?.trim();

    if (!room) {
      return {
        success: false,
        message: 'Sala não informada',
      };
    }

    if (!content) {
      return {
        success: false,
        message: 'Mensagem vazia',
      };
    }

    try {
      const savedMessage = await this.chatService.saveMessageByConversation({
        conversationId: room,
        tenantId: tenantId,
        authorId: currentUser.id,
        content,
      });

      const roomId: string = savedMessage.conversationId;

      if (!client.rooms.has(roomId)) {
        console.warn(
          'Socket não estava na room no send_message. Entrando agora:',
          {
            socketId: client.id,
            roomId,
            roomsAtuais: Array.from(client.rooms),
          },
        );

        await client.join(roomId);
      }

      const payload = {
        id: savedMessage.id,
        tenantId: savedMessage.tenantId,
        room: roomId,
        conversationId: roomId,
        authorId: savedMessage.authorId,
        author: savedMessage.author
          ? {
              id: savedMessage.author.id,
              name: savedMessage.author.name,
              status: 'online',
            }
          : null,
        content: savedMessage.content,
        createdAt: savedMessage.createdAt,
      };

      console.log('Mensagem salva no banco:', savedMessage.id);
      console.log('Emitindo para room:', roomId);

      const socketsInRoom = await this.server.in(roomId).fetchSockets();

      console.log('SOCKETS NA ROOM ANTES DO EMIT:', {
        roomId,
        total: socketsInRoom.length,
        users: socketsInRoom.map((socket) => socket.data.user),
      });

      this.server.to(roomId).emit('chat:new_message', payload);
      const participants = await this.chatService.findConversationParticipants(
        roomId,
        tenantId,
        currentUser.id,
      );
      const onlineUsers = this.onlineUsersByRoom.get(roomId);
      console.log(
        'PARTICIPANTES:',
        participants.map((p) => p.user.name),
      );
      console.log(
        'ONLINE:',
        onlineUsers ? Array.from(onlineUsers.values()).map((u) => u.name) : [],
      );
      for (const participant of participants) {
        console.log(
          'Verificando:',
          participant.user.name,
          onlineUsers?.has(participant.user.id),
        );
        const onlineUser = onlineUsers?.get(participant.user.id);
        if (!onlineUser) {
          await this.notificationService.sendPushToUser(
            participant.user.id,
            `Nova mensagem de ${savedMessage.author?.name ?? 'Cliente'}`,
            savedMessage.content ?? 'Você recebeu uma nova mensagem',
          );
        }
      }

      return {
        success: true,
        message: 'Mensagem enviada',
      };
    } catch (error) {
      console.log('Erro ao salvar mensagem:', error);

      return {
        success: false,
        message: 'Erro ao salvar mensagem',
      };
    }
  }

  @SubscribeMessage('chat:typing_start')
  async handleTypingStart(
    @MessageBody() data: SocketTypingStart,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAckResponse> {
    const currentUser = this.getAuthenticatedUser(client);

    if (!currentUser) {
      return {
        success: false,
        message: 'Usuário não autenticado',
      };
    }
    const tenantId = currentUser.tenantId;
    if (!tenantId) {
      return {
        success: false,
        message: 'Tenant não encontrado',
      };
    }
    const room = data.room?.trim();
    if (!room) {
      return {
        success: false,
        message: 'Sala não informada',
      };
    }
    const roomFound = await this.chatService.findRoomByIdOrName(room, tenantId);

    if (!roomFound) {
      return {
        success: false,
        message: 'Sala não encontrada',
      };
    }

    const payload: SocketTypingStart = {
      room: roomFound.id,
      tenantId: currentUser.tenantId,
      author: currentUser.name,
    };

    client.to(roomFound.id).emit('chat:user_typing', payload);

    return {
      success: true,
      message: 'Typing enviado',
    };
  }

  @SubscribeMessage('chat:typing_stop')
  async handleTypingStop(
    @MessageBody() data: SocketTypingStart,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAckResponse> {
    const currentUser = this.getAuthenticatedUser(client);

    if (!currentUser) {
      return {
        success: false,
        message: 'Usuário não autenticado',
      };
    }
    const tenantId = currentUser.tenantId;

    if (!tenantId) {
      return {
        success: false,
        message: 'Tenant não encontrado',
      };
    }
    const room = data.room?.trim();
    if (!room) {
      return {
        success: false,
        message: 'Sala não informada',
      };
    }
    const roomFound = await this.chatService.findRoomByIdOrName(room, tenantId);

    if (!roomFound) {
      return {
        success: false,
        message: 'Sala não encontrada',
      };
    }

    const payload: SocketTypingStart = {
      room: roomFound.id,
      tenantId: currentUser.tenantId,
      author: currentUser.name,
    };

    client.to(roomFound.id).emit('chat:user_stop_typing', payload);

    return {
      success: true,
      message: 'Typing Stop enviado',
    };
  }

  private extractTokenFromSocket(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken;
    }

    const authorization = client.handshake.headers.authorization;

    if (typeof authorization === 'string') {
      const [type, token] = authorization.split(' ');

      if (type === 'Bearer' && token) {
        return token;
      }
    }

    return null;
  }

  private getAuthenticatedUser(client: Socket): AuthenticatedSocketUser | null {
    const user = client.data.user as AuthenticatedSocketUser | undefined;

    if (!user) {
      return null;
    }

    return user;
  }

  private addOnlineUserToRoom(roomId: string, client: Socket) {
    const user = this.getAuthenticatedUser(client);

    if (!user) return;
    let usersInRoom = this.onlineUsersByRoom.get(roomId);

    if (!usersInRoom) {
      usersInRoom = new Map<string, OnlineUserWithSockets>();
      this.onlineUsersByRoom.set(roomId, usersInRoom);
    }

    let onlineUser = usersInRoom.get(user.id);

    if (!onlineUser) {
      onlineUser = {
        id: user.id,
        name: user.name,
        tenantId: user.tenantId,
        status: 'online',
        socketIds: new Set<string>(),
      };

      usersInRoom.set(user.id, onlineUser);
    }

    onlineUser.socketIds.add(client.id);

    let roomsFromSocket = this.roomsBySocket.get(client.id);

    if (!roomsFromSocket) {
      roomsFromSocket = new Set<string>();
      this.roomsBySocket.set(client.id, roomsFromSocket);
    }

    roomsFromSocket.add(roomId);
  }

  private removeOnlineUserFromRoom(roomId: string, client: Socket) {
    const user = this.getAuthenticatedUser(client);

    if (!user) return;

    const usersInRoom = this.onlineUsersByRoom.get(roomId);

    if (!usersInRoom) return;

    const onlineUser = usersInRoom.get(user.id);

    if (!onlineUser) return;

    onlineUser.socketIds.delete(client.id);

    if (onlineUser.socketIds.size === 0) {
      usersInRoom.delete(user.id);
    }

    if (usersInRoom.size === 0) {
      this.onlineUsersByRoom.delete(roomId);
    }

    const roomsFromSocket = this.roomsBySocket.get(client.id);

    if (roomsFromSocket) {
      roomsFromSocket.delete(roomId);

      if (roomsFromSocket.size === 0) {
        this.roomsBySocket.delete(client.id);
      }
    }
  }

  private removeSocketFromAllRooms(client: Socket) {
    const roomsFromSocket = this.roomsBySocket.get(client.id);

    if (!roomsFromSocket) return;

    const roomIds = Array.from(roomsFromSocket);

    for (const roomId of roomIds) {
      this.removeOnlineUserFromRoom(roomId, client);
      this.emitOnlineUsers(roomId);
    }

    this.roomsBySocket.delete(client.id);
  }

  private emitOnlineUsers(roomId: string) {
    console.log('ENTROU NO EMIT ONLINE USERS:', roomId);

    const usersInRoom = this.onlineUsersByRoom.get(roomId);

    const users: OnlineUser[] = usersInRoom
      ? Array.from(usersInRoom.values()).map((user) => ({
          id: user.id,
          name: user.name,
          tenantId: user.tenantId,
          status: user.status,
        }))
      : [];

    this.server.to(roomId).emit('chat:online_users', {
      room: roomId,
      users,
    });
  }
  emitNewMessage(
    roomId: string,
    message: {
      id: string;
      tenantId: string;
      conversationId: string;
      authorId: string | null;
      author?: {
        id: string;
        name: string;
      } | null;

      type: string;
      content: string | null;

      fileUrl: string | null;
      fileName: string | null;
      mimeType: string | null;
      fileSize: number | null;
      audioDuration: number | null;

      createdAt: Date;
    },
  ) {
    const payload = {
      id: message.id,
      tenantId: message.tenantId,

      room: roomId,
      conversationId: message.conversationId,

      authorId: message.authorId,
      author: message.author
        ? {
            id: message.author.id,
            name: message.author.name,
            status: 'online',
          }
        : null,

      type: message.type,
      content: message.content,

      fileUrl: message.fileUrl,
      fileName: message.fileName,
      mimeType: message.mimeType,
      fileSize: message.fileSize,
      audioDuration: message.audioDuration,

      createdAt: message.createdAt,
    };

    this.server.to(roomId).emit('chat:new_message', payload);
  }
  emitRoomCreatedToTenant(
    tenantId: string,
    room: { id: string; name: string; tenantId: string },
  ) {
    this.server.to(`tenant:${tenantId}`).emit('chat:room_created', room);
  }
}
