import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { JWTService } from './jwt';
import { SocketUser } from '@/types';

export class SocketService {
  // ใช้เก็บ instance เดียวของ SocketService (Singleton)
  private static instance: SocketService;

  // เก็บ instance ของ Socket.IO Server
  private io: SocketIOServer | null = null;

  // เก็บผู้ใช้ที่เชื่อมต่ออยู่ (userId → SocketUser)
  private connectedUsers = new Map<string, SocketUser>();

  // constructor เป็น private เพื่อบังคับใช้ Singleton
  private constructor() {}

  // ดึง instance ของ SocketService
  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  // เริ่มต้น Socket.IO Server
  public initialize(server: HttpServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.SOCKET_CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // ตั้งค่า middleware และ event handler
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  // Middleware สำหรับตรวจสอบ JWT ก่อนเชื่อมต่อ
  private setupMiddleware(): void {
    if (!this.io) return;

    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        if (!token) return next(new Error('Authentication error: No token provided'));

        // ลบคำว่า "Bearer " ออกจาก token
        const cleanToken = token.replace('Bearer ', '');
        // ตรวจสอบ JWT และดึง payload
        const decoded = JWTService.verifyAccessToken(cleanToken);

        // เก็บข้อมูลผู้ใช้ใน socket.data
        socket.data.user = decoded;
        next();
      } catch (error) {
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  // กำหนด event handler เมื่อผู้ใช้เชื่อมต่อ
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data.user?.userId;

      if (userId) {
        // เพิ่มผู้ใช้ลง connectedUsers
        this.connectedUsers.set(userId, {
          userId,
          socketId: socket.id,
          isOnline: true
        });

        console.log(`✅ User ${userId} connected with socket ${socket.id}`);

        // ให้ผู้ใช้เข้าห้องส่วนตัวของตัวเอง
        socket.join(`user:${userId}`);

        // Event: เข้าห้องแชท
        socket.on('join_chat', (data: { roomId: string }) => {
          socket.join(`chat:${data.roomId}`);
          console.log(`User ${userId} joined chat room: ${data.roomId}`);
        });

        // Event: ออกจากห้องแชท
        socket.on('leave_chat', (data: { roomId: string }) => {
          socket.leave(`chat:${data.roomId}`);
          console.log(`User ${userId} left chat room: ${data.roomId}`);
        });

        // Event: ส่งข้อความ
        socket.on('send_message', (data: {
          roomId: string;
          message: string;
          messageType: 'text' | 'file' | 'image';
          toUserId: string;
          jobId?: string;
          attachment?: string;
        }) => {
          // ส่งข้อความไปยังผู้ใช้ในห้อง
          socket.to(`chat:${data.roomId}`).emit('receive_message', {
            ...data,
            fromUserId: userId,
            timestamp: new Date().toISOString()
          });

          // ส่ง notification ให้ผู้ใช้เป้าหมาย
          this.sendNotificationToUser(data.toUserId, {
            type: 'chat',
            title: 'New Message',
            message: data.message.substring(0, 100),
            fromUserId: userId
          });
        });

        // Event: กำลังพิมพ์เริ่ม
        socket.on('typing_start', (data: { roomId: string; toUserId: string }) => {
          socket.to(`chat:${data.roomId}`).emit('user_typing', {
            userId,
            isTyping: true
          });
        });

        // Event: กำลังพิมพ์หยุด
        socket.on('typing_stop', (data: { roomId: string; toUserId: string }) => {
          socket.to(`chat:${data.roomId}`).emit('user_typing', {
            userId,
            isTyping: false
          });
        });

        // Event: ทำเครื่องหมายข้อความว่าอ่านแล้ว
        socket.on('mark_messages_read', (data: { roomId: string; messageIds: string[] }) => {
          socket.to(`chat:${data.roomId}`).emit('messages_read', {
            userId,
            messageIds: data.messageIds
          });
        });

        // Event: อัปเดตสถานะออนไลน์
        socket.on('update_status', (data: { isOnline: boolean }) => {
          const user = this.connectedUsers.get(userId);
          if (user) {
            user.isOnline = data.isOnline;
            this.connectedUsers.set(userId, user);
          }

          // ส่งสถานะไปยังผู้ใช้ทุกคน
          socket.broadcast.emit('user_status_changed', {
            userId,
            isOnline: data.isOnline
          });
        });

        // Event: ผู้ใช้ตัดการเชื่อมต่อ
        socket.on('disconnect', (reason) => {
          console.log(`❌ User ${userId} disconnected: ${reason}`);

          const user = this.connectedUsers.get(userId);
          if (user) {
            user.isOnline = false;
            this.connectedUsers.set(userId, user);
          }

          // แจ้งผู้ใช้คนอื่นว่าผู้ใช้นี้ออฟไลน์
          socket.broadcast.emit('user_status_changed', {
            userId,
            isOnline: false,
            lastSeen: new Date().toISOString()
          });
        });
      }
    });
  }

  // ส่ง notification ให้ผู้ใช้คนเดียว
  public sendNotificationToUser(userId: string, notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
    fromUserId?: string;
  }): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });
  }

  // ส่ง notification ให้หลายผู้ใช้
  public sendNotificationToUsers(userIds: string[], notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
  }): void {
    userIds.forEach(userId => {
      this.sendNotificationToUser(userId, notification);
    });
  }

  // ส่งข้อความ broadcast ไปทุกคน
  public broadcast(event: string, data: any): void {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  // ส่งข้อความไปยังห้องเฉพาะ
  public sendToRoom(roomId: string, event: string, data: any): void {
    if (!this.io) return;
    this.io.to(roomId).emit(event, data);
  }

  // ดึงรายชื่อผู้ใช้ที่เชื่อมต่ออยู่
  public getConnectedUsers(): SocketUser[] {
    return Array.from(this.connectedUsers.values());
  }

  // ดึงผู้ใช้ที่เชื่อมต่อด้วย userId
  public getConnectedUser(userId: string): SocketUser | undefined {
    return this.connectedUsers.get(userId);
  }

  // ตรวจสอบว่าผู้ใช้ออนไลน์หรือไม่
  public isUserOnline(userId: string): boolean {
    const user = this.connectedUsers.get(userId);
    return user?.isOnline || false;
  }

  // นับจำนวนผู้ใช้ออนไลน์
  public getOnlineUsersCount(): number {
    return Array.from(this.connectedUsers.values())
      .filter(user => user.isOnline).length;
  }

  // ลบผู้ใช้ออกจาก connectedUsers
  public removeUser(userId: string): void {
    this.connectedUsers.delete(userId);
  }

  // ส่ง notification อัปเดตงาน
  public sendJobUpdateNotification(
    userId: string, 
    jobId: string, 
    status: string, 
    message: string
  ): void {
    this.sendNotificationToUser(userId, {
      type: 'job',
      title: 'Job Update',
      message,
      data: { jobId, status }
    });
  }

  // ส่ง notification อัปเดต milestone
  public sendMilestoneUpdateNotification(
    userId: string,
    milestoneId: string,
    status: string,
    amount: number
  ): void {
    this.sendNotificationToUser(userId, {
      type: 'milestone',
      title: 'Milestone Update',
      message: `Milestone ${status}. Amount: ${amount}`,
      data: { milestoneId, status, amount }
    });
  }

  // ส่ง notification การชำระเงิน
  public sendPaymentNotification(
    userId: string,
    amount: number,
    type: 'received' | 'sent',
    transactionId: string
  ): void {
    this.sendNotificationToUser(userId, {
      type: 'payment',
      title: `Payment ${type}`,
      message: `You ${type} ${amount}`,
      data: { amount, type, transactionId }
    });
  }

  // ดึง instance ของ Socket.IO
  public getIO(): SocketIOServer | null {
    return this.io;
  }
}
