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
import { ChatEventsService } from './chat-events.service';

// ============================================================
// TYPES
// ============================================================

type SocketAckResponse = {
  success: boolean;
  message: string;

  room?: {
    id: string;
    name: string;
    tenantId: string;
  };
};

type SocketTypingPayload = {
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

// ============================================================
// GATEWAY
// ============================================================

@WebSocketGateway({
  transports: ['websocket'],

  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // ==========================================================
  // ESTADO ONLINE
  // ==========================================================

  private readonly onlineUsersByRoom = new Map<
    string,
    Map<string, OnlineUserWithSockets>
  >();

  private readonly roomsBySocket = new Map<string, Set<string>>();

  // ==========================================================
  // CONSTRUCTOR
  // ==========================================================

  constructor(
    private readonly chatService: ChatService,
    private readonly chatEvents: ChatEventsService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {
    this.registerChatEvents();
  }

  // ==========================================================
  // EVENTOS
  // ==========================================================

  private registerChatEvents(): void {
    this.chatEvents.registerNewMessage((roomId, message) => {
      this.emitNewMessage(roomId, message);
    });

    this.chatEvents.registerConversationUpdated(
      (tenantId, conversation, message) => {
        this.emitConversationUpdated(tenantId, conversation, message);
      },
    );

    // ----------------------------------------------
    // WhatsApp QR
    // ----------------------------------------------

    this.chatEvents.registerWhatsAppQr((channelId, qrCode) => {
      this.emitWhatsAppQr(channelId, qrCode);
    });

    // ----------------------------------------------
    // WhatsApp conexão
    // ----------------------------------------------

    this.chatEvents.registerWhatsAppConnection((channelId, status) => {
      this.emitWhatsAppConnection(channelId, status);
    });
  }

  // ==========================================================
  // CONNECTION
  // ==========================================================

  async handleConnection(client: Socket): Promise<void> {
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
        where: {
          id: payload.sub,
          tenantId: payload.tenantId,
        },

        select: {
          id: true,
          tenantId: true,
          name: true,
        },
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

      await client.join(`tenant:${payload.tenantId}`);

      console.log(`Cliente conectado: ${client.id} - ${user.name}`);
    } catch (error) {
      console.error('Token inválido no socket:', error);

      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.removeSocketFromAllRooms(client);

    console.log('Cliente desconectado:', client.id);
  }

  // ==========================================================
  // CREATE ROOM
  // ==========================================================

  @SubscribeMessage('chat:create_room')
  async handleCreateRoom(
    @MessageBody()
    data: {
      name?: string;
      channelId?: string;
    },

    @ConnectedSocket()
    client: Socket,
  ): Promise<SocketAckResponse> {
    const user = this.getAuthenticatedUser(client);

    if (!user) {
      return this.error('Usuário não autenticado');
    }

    const roomName = data.name?.trim();

    if (!roomName) {
      return this.error('Nome da sala é obrigatório');
    }

    const room = await this.chatService.roomCreate({
      name: roomName,
      tenantId: user.tenantId,
      channelId: data.channelId,
    });

    await client.join(room.id);

    this.addOnlineUserToRoom(room.id, client);

    this.emitOnlineUsers(room.id);

    this.server.to(`tenant:${user.tenantId}`).emit('chat:room_created', {
      id: room.id,
      name: room.name,
      tenantId: room.tenantId,
    });

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

  // ==========================================================
  // JOIN ROOM
  // ==========================================================

  @SubscribeMessage('chat:join_room')
  async handleJoinRoom(
    @MessageBody()
    data: {
      room?: string;
      name?: string;
    },

    @ConnectedSocket()
    client: Socket,
  ): Promise<SocketAckResponse> {
    const user = this.getAuthenticatedUser(client);

    if (!user) {
      return this.error('Usuário não autenticado');
    }

    const roomIdentifier = data.room?.trim() || data.name?.trim();

    if (!roomIdentifier) {
      return this.error('Sala não informada');
    }

    const room = await this.chatService.findRoomByIdOrName(
      roomIdentifier,
      user.tenantId,
    );

    if (!room) {
      return this.error('Sala não encontrada');
    }

    await client.join(room.id);

    this.addOnlineUserToRoom(room.id, client);

    this.emitOnlineUsers(room.id);

    await this.chatService.addParticipant({
      conversationId: room.id,
      userId: user.id,
      tenantId: user.tenantId,
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

  // ==========================================================
  // LEAVE ROOM
  // ==========================================================

  @SubscribeMessage('chat:leave_room')
  async handleLeaveRoom(
    @MessageBody()
    data: {
      room?: string;
      name?: string;
    },

    @ConnectedSocket()
    client: Socket,
  ): Promise<SocketAckResponse> {
    const user = this.getAuthenticatedUser(client);

    if (!user) {
      return this.error('Usuário não autenticado');
    }

    const roomIdentifier = data.room?.trim() || data.name?.trim();

    if (!roomIdentifier) {
      return this.error('Sala não informada');
    }

    const room = await this.chatService.findRoomByIdOrName(
      roomIdentifier,
      user.tenantId,
    );

    if (!room) {
      return this.error('Sala não encontrada');
    }

    await client.leave(room.id);

    this.removeOnlineUserFromRoom(room.id, client);

    this.emitOnlineUsers(room.id);

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

  // ==========================================================
  // SEND MESSAGE
  // ==========================================================

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @MessageBody()
    data: SendMessagePayload,

    @ConnectedSocket()
    client: Socket,
  ): Promise<SocketAckResponse> {
    const user = this.getAuthenticatedUser(client);

    if (!user) {
      return this.error('Usuário não autenticado');
    }

    const room = data.room?.trim();

    const content = data.content?.trim();

    if (!room) {
      return this.error('Sala não informada');
    }

    if (!content) {
      return this.error('Mensagem vazia');
    }

    try {
      const conversation = await this.chatService.findConversationById(
        user.tenantId,
        room,
      );

      if (!conversation) {
        return this.error('Conversa não encontrada');
      }

      // ======================================================
      // EXTERNO
      // ======================================================

      if (conversation.channelId) {
        await this.chatService.sendExternalMessage({
          conversationId: conversation.id,
          tenantId: user.tenantId,
          authorId: user.id,
          message: content,
        });

        return {
          success: true,
          message: 'Mensagem externa enviada',
        };
      }

      // ======================================================
      // INTERNO
      // ======================================================

      const savedMessage = await this.chatService.saveMessageByConversation({
        conversationId: conversation.id,
        tenantId: user.tenantId,
        authorId: user.id,
        content,
      });

      await this.ensureSocketInRoom(client, conversation.id);

      this.emitInternalMessage(conversation.id, savedMessage);

      await this.notifyOfflineParticipants(
        conversation.id,
        user.tenantId,
        user.id,
        savedMessage,
      );

      return {
        success: true,
        message: 'Mensagem enviada',
      };
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);

      return this.error('Erro ao enviar mensagem');
    }
  }

  // ==========================================================
  // SEND EXTERNAL MESSAGE
  // ==========================================================

  @SubscribeMessage('chat:send_external_message')
  async handleSendExternalMessage(
    @MessageBody()
    data: {
      room: string;
      content: string;
    },

    @ConnectedSocket()
    client: Socket,
  ) {
    const user = this.getAuthenticatedUser(client);

    if (!user) {
      return this.error('Usuário não autenticado');
    }

    const room = data.room?.trim();

    const content = data.content?.trim();

    if (!room) {
      return this.error('Conversa não informada');
    }

    if (!content) {
      return this.error('Mensagem vazia');
    }

    try {
      const conversation = await this.chatService.findConversationById(
        user.tenantId,
        room,
      );

      if (!conversation) {
        return this.error('Conversa não encontrada');
      }

      if (!conversation.channelId) {
        return this.error('Essa conversa não é externa');
      }

      const savedMessage = await this.chatService.sendExternalMessage({
        conversationId: conversation.id,
        tenantId: user.tenantId,
        authorId: user.id,
        message: content,
      });

      return {
        success: true,
        message: 'Mensagem externa enviada',
        data: {
          id: savedMessage.id,
          conversationId: savedMessage.conversationId,
          content: savedMessage.content,
          authorId: savedMessage.authorId,
          author: savedMessage.author,
          createdAt: savedMessage.createdAt,
        },
      };
    } catch (error) {
      console.error('Erro ao enviar mensagem externa:', error);

      return this.error('Erro ao enviar mensagem externa');
    }
  }

  // ==========================================================
  // TYPING START
  // ==========================================================

  @SubscribeMessage('chat:typing_start')
  async handleTypingStart(
    @MessageBody()
    data: SocketTypingPayload,

    @ConnectedSocket()
    client: Socket,
  ): Promise<SocketAckResponse> {
    return this.handleTyping(data, client, 'chat:user_typing');
  }

  // ==========================================================
  // TYPING STOP
  // ==========================================================

  @SubscribeMessage('chat:typing_stop')
  async handleTypingStop(
    @MessageBody()
    data: SocketTypingPayload,

    @ConnectedSocket()
    client: Socket,
  ): Promise<SocketAckResponse> {
    return this.handleTyping(data, client, 'chat:user_stop_typing');
  }

  private async handleTyping(
    data: SocketTypingPayload,
    client: Socket,
    event: string,
  ): Promise<SocketAckResponse> {
    const user = this.getAuthenticatedUser(client);

    if (!user) {
      return this.error('Usuário não autenticado');
    }

    const room = data.room?.trim();

    if (!room) {
      return this.error('Sala não informada');
    }

    const roomFound = await this.chatService.findRoomByIdOrName(
      room,
      user.tenantId,
    );

    if (!roomFound) {
      return this.error('Sala não encontrada');
    }

    client.to(roomFound.id).emit(event, {
      room: roomFound.id,
      tenantId: user.tenantId,
      author: user.name,
    });

    return {
      success: true,
      message: 'Typing enviado',
    };
  }

  // ==========================================================
  // WHATSAPP QR
  // ==========================================================

  private emitWhatsAppQr(channelId: string, qrCode: string): void {
    console.log('ENVIANDO QR WHATSAPP:', channelId);

    // Por enquanto enviamos para o tenant.
    //
    // Depois vamos melhorar isso para o tenant
    // do channel, evitando qualquer possibilidade
    // de enviar para a empresa errada.

    // ESTE EVENTO SERÁ FINALIZADO JUNTO COM
    // A ESTRUTURA DE CHANNEL/SESSION.

    this.server.emit('whatsapp:qr', {
      channelId,
      qrCode,
    });
  }

  // ==========================================================
  // WHATSAPP CONNECTION
  // ==========================================================

  private emitWhatsAppConnection(
    channelId: string,
    status: 'connected' | 'disconnected',
  ): void {
    this.server.emit('whatsapp:connection', {
      channelId,
      status,
    });
  }

  // ==========================================================
  // INTERNAL MESSAGE
  // ==========================================================

  private emitInternalMessage(roomId: string, message: any): void {
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

  // ==========================================================
  // NEW MESSAGE
  // ==========================================================

  emitNewMessage(roomId: string, message: any): void {
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

  // ==========================================================
  // CONVERSATION UPDATED
  // ==========================================================
  emitRoomCreatedToTenant(
    tenantId: string,
    room: {
      id: string;
      name: string;
      tenantId: string;
    },
  ): void {
    this.server.to(`tenant:${tenantId}`).emit('chat:room_created', room);
  }
  emitConversationUpdated(
    tenantId: string,
    conversation: any,
    message: any,
  ): void {
    const payload = {
      conversationId: conversation.id,

      tenantId: conversation.tenantId,

      conversation: {
        id: conversation.id,
        tenantId: conversation.tenantId,

        name: conversation.name,

        contact: conversation.contact
          ? {
              id: conversation.contact.id,

              name: conversation.contact.name,
            }
          : null,
      },

      lastMessage: {
        id: message.id,
        type: message.type,
        content: message.content,

        fileUrl: message.fileUrl,
        fileName: message.fileName,
        mimeType: message.mimeType,
        fileSize: message.fileSize,
        audioDuration: message.audioDuration,

        createdAt: message.createdAt,

        authorId: message.authorId,
      },
    };

    this.server
      .to(`tenant:${tenantId}`)
      .emit('chat:conversation_updated', payload);
  }

  // ==========================================================
  // ONLINE USERS
  // ==========================================================

  private addOnlineUserToRoom(roomId: string, client: Socket): void {
    const user = this.getAuthenticatedUser(client);

    if (!user) {
      return;
    }

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

    let rooms = this.roomsBySocket.get(client.id);

    if (!rooms) {
      rooms = new Set<string>();

      this.roomsBySocket.set(client.id, rooms);
    }

    rooms.add(roomId);
  }

  private removeOnlineUserFromRoom(roomId: string, client: Socket): void {
    const user = this.getAuthenticatedUser(client);

    if (!user) {
      return;
    }

    const users = this.onlineUsersByRoom.get(roomId);

    if (!users) {
      return;
    }

    const onlineUser = users.get(user.id);

    if (!onlineUser) {
      return;
    }

    onlineUser.socketIds.delete(client.id);

    if (onlineUser.socketIds.size === 0) {
      users.delete(user.id);
    }

    if (users.size === 0) {
      this.onlineUsersByRoom.delete(roomId);
    }

    const rooms = this.roomsBySocket.get(client.id);

    if (rooms) {
      rooms.delete(roomId);

      if (rooms.size === 0) {
        this.roomsBySocket.delete(client.id);
      }
    }
  }

  private emitOnlineUsers(roomId: string): void {
    const users = this.onlineUsersByRoom.get(roomId);

    const onlineUsers: OnlineUser[] = users
      ? Array.from(users.values()).map((user) => ({
          id: user.id,
          name: user.name,
          tenantId: user.tenantId,
          status: user.status,
        }))
      : [];

    this.server.to(roomId).emit('chat:online_users', {
      room: roomId,
      users: onlineUsers,
    });
  }

  private removeSocketFromAllRooms(client: Socket): void {
    const rooms = this.roomsBySocket.get(client.id);

    if (!rooms) {
      return;
    }

    for (const roomId of rooms) {
      this.removeOnlineUserFromRoom(roomId, client);

      this.emitOnlineUsers(roomId);
    }

    this.roomsBySocket.delete(client.id);
  }

  // ==========================================================
  // NOTIFICAÇÕES
  // ==========================================================

  private async notifyOfflineParticipants(
    conversationId: string,
    tenantId: string,
    currentUserId: string,
    message: any,
  ): Promise<void> {
    const participants = await this.chatService.findConversationParticipants(
      conversationId,
      tenantId,
      currentUserId,
    );

    const onlineUsers = this.onlineUsersByRoom.get(conversationId);

    for (const participant of participants) {
      if (!onlineUsers?.has(participant.user.id)) {
        await this.notificationService.sendPushToUser(
          participant.user.id,
          `Nova mensagem de ${message.author?.name ?? 'Usuário'}`,
          message.content ?? 'Você recebeu uma nova mensagem',
        );
      }
    }
  }

  // ==========================================================
  // SOCKET ROOM
  // ==========================================================

  private async ensureSocketInRoom(
    client: Socket,
    roomId: string,
  ): Promise<void> {
    if (client.rooms.has(roomId)) {
      return;
    }

    await client.join(roomId);

    this.addOnlineUserToRoom(roomId, client);
  }

  // ==========================================================
  // AUTH
  // ==========================================================

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
    return (client.data.user as AuthenticatedSocketUser | undefined) ?? null;
  }

  // ==========================================================
  // ERROR
  // ==========================================================

  private error(message: string): SocketAckResponse {
    return {
      success: false,
      message,
    };
  }
}
