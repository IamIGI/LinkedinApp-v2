import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { AuthService } from 'src/auth/services/auth.service';
import { ConversationService } from 'src/chat/services/conversation.service';
import { Subscription, of, take, tap } from 'rxjs';
import { User } from 'src/auth/models/user.class';
import { ActiveConversation } from 'src/chat/models/active-conversation.interface';
import { Message } from 'src/chat/models/message.interface';

@WebSocketGateway({ cors: { origin: ['http://localhost:4200'] } })
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  constructor(
    private authService: AuthService,
    private conversationService: ConversationService,
  ) {}

  //Run when server starts
  onModuleInit() {
    this.conversationService
      .removeActiveConversations()
      .pipe(take(1))
      .subscribe();
    this.conversationService.removeMessages().pipe(take(1)).subscribe();
    this.conversationService.removeConversations().pipe(take(1)).subscribe();
  }

  @WebSocketServer()
  server: Server;

  @UseGuards(JwtGuard)
  handleConnection(socket: Socket) {
    console.log('HANDLE CONNECTION');

    const jwt = socket.handshake.headers.authorization || null;
    this.authService.getJwtUser(jwt).subscribe((user: User) => {
      if (!user) {
        console.log('NO USER');
        this.handleDisconnect(socket);
      } else {
        socket.data.user = user;
        this.getConversations(socket, user.id);
      }
    });
  }

  getConversations(socket: Socket, userId: number): Subscription {
    return this.conversationService
      .getConversationsWithUsers(userId)
      .subscribe((conversations) => {
        this.server.to(socket.id).emit('conversations', conversations);
      });
  }

  handleDisconnect(socket: Socket) {
    console.log('HANDLE DISCONNECT');
    this.conversationService
      .leaveConversation(socket.id)
      .pipe(take(1))
      .subscribe();
  }

  @SubscribeMessage('createConversation')
  createConversation(socket: Socket, friend: User) {
    this.conversationService
      .createConversation(socket.data.user, friend)
      .pipe(take(1))
      .subscribe(() => {
        this.getConversations(socket, socket.data.user.id);
      });
  }

  @SubscribeMessage('sendMessage')
  handleMessage(socket: Socket, newMessage: Message) {
    if (!newMessage.conversation) return of(null);

    const { user } = socket.data;
    newMessage.user = user;

    if (newMessage.conversation.id) {
      this.conversationService
        .createMessage(newMessage)
        .pipe(take(1))
        .subscribe((message: Message) => {
          newMessage.id = message.id;
          this.conversationService
            .getActiveUsers(newMessage.conversation.id)
            .pipe(take(1))
            .subscribe((activeConversations: ActiveConversation[]) => {
              activeConversations.forEach(
                (activeConversation: ActiveConversation) => {
                  this.server
                    .to(activeConversation.socketId)
                    .emit('newMessage', newMessage);
                },
              );
            });
        });
    }
  }

  @SubscribeMessage('joinConversation')
  joinConversation(socket: Socket, friendId: number) {
    this.conversationService
      .joinConversation(friendId, socket.data.user.id, socket.id)
      .pipe(
        tap((activeConversation: ActiveConversation) => {
          this.conversationService
            .getMessages(activeConversation.conversationId)
            .pipe(take(1))
            .subscribe((messages: Message[]) => {
              this.server.to(socket.id).emit('messages', messages);
            });
        }),
      )
      .pipe(take(1))
      .subscribe();
  }

  @SubscribeMessage('leaveConversation')
  leaveConversation(socket: Socket) {
    this.conversationService
      .leaveConversation(socket.id)
      .pipe(take(1))
      .subscribe();
  }
}
