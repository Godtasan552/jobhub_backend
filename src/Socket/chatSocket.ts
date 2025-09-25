// นำเข้า Server และ Socket จาก socket.io library สำหรับจัดการ WebSocket
import { Server as SocketIOServer, Socket } from 'socket.io'; // นำเข้า class Server และ Socket จาก socket.io

// นำเข้า JWTService สำหรับการตรวจสอบ authentication token (ถ้าจำเป็น)
import { JWTService } from '@/config/jwt'; // นำเข้า JWTService สำหรับจัดการ token (ถ้ามีการใช้งาน)

// นำเข้า Models จาก Mongoose สำหรับจัดการฐานข้อมูล
import Message from '../Models/Message'; // นำเข้าโมเดล Message สำหรับจัดการข้อความแชท
import User from '../Models/User'; // นำเข้าโมเดล User สำหรับจัดการข้อมูลผู้ใช้
import Notification from '../Models/Nontification'; // นำเข้าโมเดล Notification สำหรับจัดการการแจ้งเตือน

// นำเข้าค่าคงที่ที่เก็บ event names ของ socket
import { SOCKET_EVENTS } from '../utils/constants'; // นำเข้าค่าคงที่ของ event socket

// นำเข้า TypeScript interfaces สำหรับการกำหนด type ของข้อมูล
import { IMessage, IUser, INotificationModel } from '@/types/index'; // นำเข้า type ที่เกี่ยวข้อง

/**
 * คลาสหลักสำหรับจัดการ Socket.IO events ที่เกี่ยวข้องกับระบบแชท
 * ทำหน้าที่เป็นตัวกลางในการรับส่งข้อความ, จัดการห้องแชท, และแจ้งเตือน
 */
export class ChatSocketHandler {
  private io: SocketIOServer; // เก็บ instance ของ socket.io server สำหรับการสื่อสาร
  
  // Map สำหรับเก็บข้อมูลผู้ใช้ที่เชื่อมต่ออยู่ - userId เป็น key, Set ของ socketId เป็น value
  private connectedUsers = new Map<string, Set<string>>(); // userId -> Set ของ socketId ที่เชื่อมต่อ
  
  // Map สำหรับเก็บข้อมูลห้องที่ user แต่ละคนเข้าร่วม - socketId เป็น key, Set ของ roomId เป็น value
  private userRooms = new Map<string, Set<string>>(); // socketId -> Set ของ roomId ที่ user เข้าร่วม

  /**
   * Constructor สำหรับสร้าง ChatSocketHandler instance
   * @param io - instance ของ Socket.IO server
   */
  constructor(io: SocketIOServer) {
    this.io = io; // กำหนดค่า io ที่รับเข้ามาให้กับ property ของ class
  }

  /**
   * ฟังก์ชันหลักสำหรับจัดการ socket connection ใหม่
   * เมื่อมี client เชื่อมต่อเข้ามาจะต้องผ่านฟังก์ชันนี้ก่อน
   * @param socket - socket instance ที่เพิ่งเชื่อมต่อเข้ามา
   */
  public handleConnection(socket: Socket): void {
    // ดึง userId จาก socket data ที่ถูกตั้งค่าไว้ในขั้นตอน authentication
    const userId = socket.data.user?.userId; // ดึง userId จากข้อมูล socket

    // ตรวจสอบว่ามี userId หรือไม่ ถ้าไม่มีแสดงว่าไม่ได้ login
    if (!userId) { // ถ้าไม่มี userId ให้ตัดการเชื่อมต่อ
      socket.disconnect(true); // บังคับตัดการเชื่อมต่อทันที
      return; // หยุดการทำงานของฟังก์ชัน
    }

    // บันทึกการเชื่อมต่อของ user โดยเพิ่ม socketId เข้าไปใน Map
    this.addConnectedUser(userId, socket.id); // เพิ่ม userId กับ socketId ลงใน map

    // แสดง log เพื่อติดตามการเชื่อมต่อ
    console.log(`💬 Chat: User ${userId} connected with socket ${socket.id}`);

    // ให้ socket เข้าร่วมห้องส่วนตัวของตนเอง สำหรับรับการแจ้งเตือนส่วนตัว
    socket.join(`user:${userId}`); // ให้ socket เข้าห้องส่วนตัวของ user

    // เรียกใช้ฟังก์ชันต่างๆ เพื่อจัดการ event ที่เกี่ยวข้องกับ chat
    this.handleJoinRoom(socket); // ตั้งค่า handler สำหรับการเข้าร่วมห้องแชท
    this.handleLeaveRoom(socket); // ตั้งค่า handler สำหรับการออกจากห้องแชท
    this.handleSendMessage(socket); // ตั้งค่า handler สำหรับการส่งข้อความ
    this.handleTypingStart(socket); // ตั้งค่า handler สำหรับการเริ่มพิมพ์
    this.handleTypingStop(socket); // ตั้งค่า handler สำหรับการหยุดพิมพ์
    this.handleMarkMessagesRead(socket); // ตั้งค่า handler สำหรับการ mark ข้อความว่าอ่านแล้ว
    this.handleGetOnlineStatus(socket); // ตั้งค่า handler สำหรับตรวจสอบสถานะออนไลน์
    this.handleDisconnect(socket); // ตั้งค่า handler สำหรับการตัดการเชื่อมต่อ
  }

  /**
   * จัดการ event การ join ห้องแชท
   * ใช้เมื่อ user ต้องการเข้าร่วมห้องแชทเฉพาะ
   * @param socket - socket instance ของ user ที่ต้องการ join
   */
  private handleJoinRoom(socket: Socket): void {
    // ลงทะเบียน event listener สำหรับ JOIN_CHAT event
    socket.on(SOCKET_EVENTS.JOIN_CHAT, async (data: { roomId: string; otherUserId: string; jobId?: string }) => {
      try {
        // ดึง userId จาก socket data
        const userId = socket.data.user?.userId;
        
        // แยกข้อมูลจาก parameter ที่ส่งมา
        const { roomId, otherUserId, jobId } = data;

        // ตรวจสอบสิทธิ์ว่า user นี้สามารถเข้าห้องนี้ได้หรือไม่
        if (!this.canUserJoinRoom(userId, otherUserId, roomId)) {
          // ถ้าไม่มีสิทธิ์ ส่ง error กลับไป
          socket.emit('error', { message: 'Cannot join this chat room' });
          return; // หยุดการทำงาน
        }

        // ให้ socket เข้าร่วมห้องแชทที่ระบุ
        socket.join(`chat:${roomId}`); // ให้ socket เข้าห้องแชท
        
        // บันทึกข้อมูลว่า socket นี้อยู่ในห้องไหน
        this.addUserToRoom(socket.id, roomId); // บันทึกว่ามี socketId อยู่ในห้องนี้

        // แจ้งเตือนผู้ใช้คนอื่นในห้องว่ามีคนเข้ามาใหม่
        socket.to(`chat:${roomId}`).emit('user_joined', {
          userId, // ใครเป็นคนเข้ามา
          roomId, // ห้องไหน
          timestamp: new Date().toISOString() // เวลาที่เข้ามา
        });

        // ส่งข้อมูลยืนยันกลับไปยังผู้ที่ join ว่าเข้าร่วมสำเร็จ
        socket.emit('room_joined', {
          roomId, // ห้องที่เข้าร่วม
          otherUserId, // คนที่จะคุยด้วย
          jobId, // งานที่เกี่ยวข้อง (ถ้ามี)
          timestamp: new Date().toISOString() // เวลาที่เข้าร่วม
        });

        // แสดง log เพื่อติดตาม
        console.log(`User ${userId} joined chat room: ${roomId}`);
      } catch (error) {
        // จัดการ error ที่เกิดขึ้น
        console.error('Error joining chat room:', error);
        socket.emit('error', { message: 'Failed to join chat room' });
      }
    });
  }

  /**
   * จัดการ event การออกจากห้องแชท
   * ใช้เมื่อ user ต้องการออกจากห้องแชท
   * @param socket - socket instance ของ user ที่ต้องการออก
   */
  private handleLeaveRoom(socket: Socket): void {
    // ลงทะเบียน event listener สำหรับ LEAVE_CHAT event
    socket.on(SOCKET_EVENTS.LEAVE_CHAT, (data: { roomId: string }) => {
      // ดึง userId จาก socket data
      const userId = socket.data.user?.userId;
      
      // แยกข้อมูลจาก parameter
      const { roomId } = data;

      // ให้ socket ออกจากห้องแชทที่ระบุ
      socket.leave(`chat:${roomId}`); // ออกจากห้องแชท
      
      // ลบข้อมูลการเป็นสมาชิกของห้องนี้
      this.removeUserFromRoom(socket.id, roomId); // ลบข้อมูล socketId ออกจากห้องนี้

      // แจ้งเตือนผู้ใช้คนอื่นในห้องว่ามีคนออกไป
      socket.to(`chat:${roomId}`).emit('user_left', {
        userId, // ใครเป็นคนออกไป
        roomId, // จากห้องไหน
        timestamp: new Date().toISOString() // เวลาที่ออกไป
      });

      // แสดง log เพื่อติดตาม
      console.log(`User ${userId} left chat room: ${roomId}`);
    });
  }

  /**
   * จัดการ event การส่งข้อความ
   * ฟังก์ชันหลักของระบบแชท - รับข้อความจาก client แล้วประมวลผลและส่งต่อ
   * @param socket - socket instance ของ user ที่ส่งข้อความ
   */
  private handleSendMessage(socket: Socket): void {
    // ลงทะเบียน event listener สำหรับ SEND_MESSAGE event
    socket.on(SOCKET_EVENTS.SEND_MESSAGE, async (data: {
      roomId: string; // รหัสห้องแชทที่จะส่งข้อความ
      toUserId: string; // รหัสผู้รับข้อความ
      message: string; // เนื้อหาข้อความ
      messageType: 'text' | 'file' | 'image'; // ประเภทข้อความ
      jobId?: string; // รหัสงานที่เกี่ยวข้อง (optional)
      attachment?: string; // ไฟล์แนบ (optional)
    }) => {
      try {
        // ดึง userId ของผู้ส่งจาก socket data
        const fromUserId = socket.data.user?.userId;
        
        // แยกข้อมูลจาก parameter ที่ส่งมา
        const { roomId, toUserId, message, messageType, jobId, attachment } = data;

        // ตรวจสอบว่าข้อความไม่เป็นค่าว่างหรือมีแต่ space
        if (!message || message.trim().length === 0) {
          socket.emit('error', { message: 'Message cannot be empty' });
          return; // หยุดการทำงานถ้าข้อความว่าง
        }

        // ตรวจสอบความยาวข้อความไม่เกิน 2000 ตัวอักษร
        if (message.length > 2000) {
          socket.emit('error', { message: 'Message too long' });
          return; // หยุดการทำงานถ้าข้อความยาวเกินไป
        }

        // ค้นหาข้อมูลผู้รับในฐานข้อมูลเพื่อยืนยันว่ามีจริง
        const recipient = await User.findById(toUserId) as IUser | null;
        if (!recipient) {
          socket.emit('error', { message: 'Recipient not found' });
          return; // หยุดการทำงานถ้าไม่พบผู้รับ
        }

        // สร้างข้อความใหม่ในฐานข้อมูล
        const newMessage = new Message({
          fromUserId, // ผู้ส่ง
          toUserId, // ผู้รับ
          jobId: jobId || null, // งานที่เกี่ยวข้อง
          message: message.trim(), // เนื้อหาข้อความ (ตัด space หัวท้าย)
          messageType, // ประเภทข้อความ
          attachment, // ไฟล์แนบ
          read: false // ตั้งค่าเริ่มต้นว่ายังไม่อ่าน
        });

        // บันทึกข้อความลงฐานข้อมูล
        await newMessage.save(); // บันทึกข้อความลงฐานข้อมูล

        // ดึงข้อมูลเพิ่มเติม (populate) เพื่อแสดงชื่อผู้ใช้และข้อมูลงาน
        await newMessage.populate([
          { path: 'fromUserId', select: 'name email profilePic' }, // ข้อมูลผู้ส่ง
          { path: 'toUserId', select: 'name email profilePic' }, // ข้อมูลผู้รับ
          { path: 'jobId', select: 'title' } // ข้อมูลงาน
        ]);

        // แปลง message object เป็น type ที่กำหนด
        const populatedMessage = newMessage as IMessage;

        // เตรียมข้อมูลสำหรับส่งผ่าน socket
        const messageData = {
          ...populatedMessage.toJSON(), // แปลงเป็น plain object
          timestamp: new Date().toISOString() // เพิ่ม timestamp
        };

        // ส่งข้อความไปยังผู้ใช้คนอื่นในห้อง (ยกเว้นผู้ส่ง)
        socket.to(`chat:${roomId}`).emit(SOCKET_EVENTS.RECEIVE_MESSAGE, {
          ...messageData,
          isFromMe: false // บอกว่าไม่ใช่ข้อความจากตนเอง
        });

        // ส่งยืนยันกลับไปยังผู้ส่งว่าส่งข้อความสำเร็จ
        socket.emit('message_sent', {
          ...messageData,
          isFromMe: true // บอกว่าเป็นข้อความจากตนเอง
        });

        // ตรวจสอบว่าผู้รับกำลังออนไลน์ในห้องนี้หรือไม่
        const recipientSockets = this.connectedUsers.get(toUserId); // ดึง socket ทั้งหมดของผู้รับ
        const isRecipientInRoom = recipientSockets && 
          Array.from(recipientSockets).some(socketId => {
            const userRooms = this.userRooms.get(socketId); // ดึงห้องทั้งหมดที่ socket นี้เข้าร่วม
            return userRooms?.has(roomId); // ตรวจสอบว่าอยู่ในห้องนี้หรือไม่
          });

        // ถ้าผู้รับไม่ได้อยู่ในห้อง ให้สร้างการแจ้งเตือน
        if (!isRecipientInRoom) {
          // สร้างการแจ้งเตือนในฐานข้อมูล
          await (Notification as INotificationModel).createChatNotification(
            toUserId, // ผู้รับการแจ้งเตือน
            populatedMessage._id, // รหัสข้อความ
            'New Message', // หัวข้อการแจ้งเตือน
            message.length > 50 ? `${message.substring(0, 50)}...` : message, // เนื้อหา (ตัดถ้ายาวเกิน 50 ตัวอักษร)
            `/chat/${fromUserId}` // ลิงก์ไปยังหน้าแชท
          );

          // ส่ง push notification แบบ real-time ไปยังช่องส่วนตัวของผู้รับ
          this.io.to(`user:${toUserId}`).emit(SOCKET_EVENTS.NOTIFICATION, {
            type: 'chat', // ประเภทการแจ้งเตือน
            title: 'New Message', // หัวข้อ
            message: `Message from ${socket.data.user.name || 'Someone'}`, // เนื้อหา
            data: { messageId: populatedMessage._id, fromUserId, roomId } // ข้อมูลเพิ่มเติม
          });
        }

        // แสดง log เพื่อติดตามการส่งข้อความ
        console.log(`Message sent from ${fromUserId} to ${toUserId} in room ${roomId}`);
      } catch (error) {
        // จัดการ error ที่เกิดขึ้น
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });
  }

  /**
   * จัดการ event เริ่มพิมพ์ข้อความ (typing indicator)
   * แสดงสถานะว่า user กำลังพิมพ์ข้อความอยู่
   * @param socket - socket instance ของ user ที่กำลังพิมพ์
   */
  private handleTypingStart(socket: Socket): void {
    // ลงทะเบียน event listener สำหรับ TYPING_START event
    socket.on(SOCKET_EVENTS.TYPING_START, (data: { roomId: string; toUserId: string }) => {
      // ดึง userId ของผู้พิมพ์
      const userId = socket.data.user?.userId;
      
      // แยกข้อมูลจาก parameter
      const { roomId } = data;

      // ส่งสัญญาณไปยังผู้ใช้คนอื่นในห้องว่ากำลังพิมพ์
      socket.to(`chat:${roomId}`).emit(SOCKET_EVENTS.USER_TYPING, {
        userId, // ใครเป็นคนกำลังพิมพ์
        isTyping: true, // สถานะกำลังพิมพ์
        timestamp: new Date().toISOString() // เวลาที่เริ่มพิมพ์
      });
    });
  }

  /**
   * จัดการ event หยุดพิมพ์ข้อความ (typing indicator stop)
   * ยกเลิกสถานะการพิมพ์ข้อความ
   * @param socket - socket instance ของ user ที่หยุดพิมพ์
   */
  private handleTypingStop(socket: Socket): void {
    // ลงทะเบียน event listener สำหรับ TYPING_STOP event
    socket.on(SOCKET_EVENTS.TYPING_STOP, (data: { roomId: string; toUserId: string }) => {
      // ดึง userId ของผู้ที่หยุดพิมพ์
      const userId = socket.data.user?.userId;
      
      // แยกข้อมูลจาก parameter
      const { roomId } = data;

      // ส่งสัญญาณไปยังผู้ใช้คนอื่นในห้องว่าหยุดพิมพ์แล้ว
      socket.to(`chat:${roomId}`).emit(SOCKET_EVENTS.USER_TYPING, {
        userId, // ใครเป็นคนหยุดพิมพ์
        isTyping: false, // สถานะหยุดพิมพ์
        timestamp: new Date().toISOString() // เวลาที่หยุดพิมพ์
      });
    });
  }

  /**
   * จัดการ event การทำเครื่องหมายข้อความว่าอ่านแล้ว
   * อัปเดตสถานะข้อความในฐานข้อมูลและแจ้งผู้ส่ง
   * @param socket - socket instance ของ user ที่อ่านข้อความ
   */
  private handleMarkMessagesRead(socket: Socket): void {
    // ลงทะเบียน event listener สำหรับ MARK_MESSAGES_READ event
    socket.on(SOCKET_EVENTS.MARK_MESSAGES_READ, async (data: { 
      roomId: string;  // ห้องแชทที่อ่านข้อความ
      messageIds: string[]; // รายการรหัสข้อความที่อ่านแล้ว
      fromUserId: string; // ผู้ส่งข้อความเหล่านั้น
    }) => {
      try {
        // ดึง userId ของผู้อ่าน
        const userId = socket.data.user?.userId;
        
        // แยกข้อมูลจาก parameter
        const { roomId, messageIds, fromUserId } = data;

        // อัปเดตสถานะข้อความในฐานข้อมูลว่าอ่านแล้ว
        const updatedCount = await (Message as any).markMultipleAsRead(messageIds, userId);

        // ถ้ามีการอัปเดตสำเร็จ
        if (updatedCount > 0) {
          // แจ้ง sender ในห้องว่าข้อความถูกอ่านแล้ว
          socket.to(`chat:${roomId}`).emit(SOCKET_EVENTS.MESSAGES_READ, {
            userId, // ใครเป็นคนอ่าน
            messageIds, // ข้อความไหนบ้างที่ถูกอ่าน
            readAt: new Date().toISOString() // เวลาที่อ่าน
          });

          // แจ้งผ่านช่องส่วนตัวของ sender ด้วย
          this.io.to(`user:${fromUserId}`).emit(SOCKET_EVENTS.MESSAGES_READ, {
            userId, // ใครเป็นคนอ่าน
            messageIds, // ข้อความไหนบ้างที่ถูกอ่าน
            readAt: new Date().toISOString(), // เวลาที่อ่าน
            roomId // ในห้องไหน
          });
        }

        // ส่งยืนยันกลับไปยังผู้ที่ทำการ mark
        socket.emit('messages_marked_read', {
          updatedCount, // จำนวนข้อความที่อัปเดต
          messageIds // รายการข้อความที่อัปเดต
        });
      } catch (error) {
        // จัดการ error ที่เกิดขึ้น
        console.error('Error marking messages as read:', error);
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });
  }

  /**
   * จัดการ event การขอตรวจสอบสถานะออนไลน์ของ user หลายคน
   * ใช้เมื่อต้องการทราบว่า user คนไหนออนไลน์อยู่บ้าง
   * @param socket - socket instance ของ user ที่ขอข้อมูล
   */
  private handleGetOnlineStatus(socket: Socket): void {
    // ลงทะเบียน event listener สำหรับ get_online_status event
    socket.on('get_online_status', (data: { userIds: string[] }) => {
      // แยกข้อมูลจาก parameter
      const { userIds } = data;
      
      // สร้าง object สำหรับเก็บสถานะออนไลน์
      const onlineStatus: Record<string, boolean> = {};

      // ตรวจสอบสถานะของแต่ละ user
      userIds.forEach(userId => {
        onlineStatus[userId] = this.connectedUsers.has(userId); // ตรวจสอบว่าออนไลน์หรือไม่
      });

      // ส่งผลลัพธ์กลับไปยังผู้ขอ
      socket.emit('online_status', onlineStatus); // ส่งผลลัพธ์กลับ
    });
  }

  /**
   * จัดการ event การตัดการเชื่อมต่อของ user
   * ทำการ cleanup ข้อมูลและแจ้งเตือน user อื่น
   * @param socket - socket instance ที่กำลังจะตัดการเชื่อมต่อ
   */
  private handleDisconnect(socket: Socket): void {
    // ลงทะเบียน event listener สำหรับ disconnect event
    socket.on('disconnect', (reason) => {
      // ดึง userId ของผู้ที่ตัดการเชื่อมต่อ
      const userId = socket.data.user?.userId;

      // ตรวจสอบว่ามี userId
      if (userId) {
        // ลบ socketId นี้ออกจากรายการของ userId
        this.removeConnectedUser(userId, socket.id); // ลบ socketId ออกจาก userId
        
        // ลบ socketId นี้ออกจากทุกห้องที่เข้าร่วม
        this.removeUserFromAllRooms(socket.id); // ลบ socketId ออกจากทุกห้อง

        // ตรวจสอบว่า user นี้ยังมี socket อื่นเชื่อมต่ออยู่หรือไม่
        if (!this.connectedUsers.has(userId)) {
          // ถ้าไม่มี socket ใดเชื่อมต่ออยู่แล้ว ให้ broadcast ว่า user offline
          socket.broadcast.emit(SOCKET_EVENTS.USER_STATUS_CHANGED, {
            userId, // ใครออฟไลน์
            isOnline: false, // สถานะออฟไลน์
            lastSeen: new Date().toISOString() // เวลาที่ออฟไลน์
          });
        }

        // แสดง log เพื่อติดตามการตัดการเชื่อมต่อ
        console.log(`💬 Chat: User ${userId} disconnected (${reason})`);
      }
    });
  }

  /**
   * ส่ง event ไปยังห้องแชทที่ระบุ
   * ใช้สำหรับส่งข้อความจากภายนอก class ไปยังห้องแชท
   * @param roomId - รหัสห้องที่จะส่งข้อความไป
   * @param event - ชื่อ event ที่จะส่ง
   * @param data - ข้อมูลที่จะส่งไปพร้อมกับ event
   */
  public sendToRoom(roomId: string, event: string, data: any): void {
    // ส่ง event ไปยังทุกคนในห้องที่ระบุ
    this.io.to(`chat:${roomId}`).emit(event, data);
  }

  /**
   * ส่ง event ไปยัง user ที่ระบุโดยตรง
   * ใช้สำหรับส่งการแจ้งเตือนส่วนตัวหรือข้อความเฉพาะ user
   * @param userId - รหัส user ที่จะส่งข้อความไป
   * @param event - ชื่อ event ที่จะส่ง
   * @param data - ข้อมูลที่จะส่งไปพร้อมกับ event
   */
  public sendToUser(userId: string, event: string, data: any): void {
    // ส่ง event ไปยังช่องส่วนตัวของ user ที่ระบุ
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * ดึงรายการ userId ที่กำลังออนไลน์ในห้องแชทที่ระบุ
   * ใช้สำหรับแสดงรายชื่อคนที่อยู่ในห้อง
   * @param roomId - รหัสห้องที่ต้องการตรวจสอบ
   * @returns array ของ userId ที่ออนไลน์ในห้องนั้น
   */
  public getOnlineUsersInRoom(roomId: string): string[] {
    // ดึงข้อมูลห้องจาก socket.io adapter
    const room = this.io.sockets.adapter.rooms.get(`chat:${roomId}`);
    if (!room) return []; // ถ้าไม่มีห้องนี้ ให้คืน array ว่าง

    // สร้าง array สำหรับเก็บ userId
    const userIds: string[] = [];
    
    // วนลูปตรวจสอบทุก socket ในห้อง
    room.forEach(socketId => {
      // ดึง socket instance จาก socketId
      const socket = this.io.sockets.sockets.get(socketId);
      
      // ตรวจสอบว่า socket มี userId หรือไม่
      if (socket?.data?.user?.userId) {
        userIds.push(socket.data.user.userId); // เพิ่ม userId เข้าไปใน array
      }
    });

    // คืน array ที่ลบค่าซ้ำออกแล้ว (เพราะ user อาจมีหลาย socket)
    return [...new Set(userIds)]; // ลบค่าซ้ำ
  }

  /**
   * ตรวจสอบว่า user ที่ระบุกำลังออนไลน์หรือไม่
   * @param userId - รหัส user ที่ต้องการตรวจสอบ
   * @returns true ถ้าออนไลน์, false ถ้าออฟไลน์
   */
  public isUserOnline(userId: string): boolean {
    // ตรวจสอบว่ามี userId นี้ใน Map ของผู้ใช้ที่เชื่อมต่อหรือไม่
    return this.connectedUsers.has(userId);
  }

  /**
   * ดึงจำนวนผู้ใช้ที่กำลังออนไลน์ทั้งหมด
   * ใช้สำหรับแสดงสถิติหรือ monitoring
   * @returns จำนวน user ที่ออนไลน์
   */
  public getOnlineUsersCount(): number {
    // คืนจำนวน key ใน Map ซึ่งแต่ละ key คือ userId ที่ออนไลน์
    return this.connectedUsers.size;
  }

  // ----------------- ส่วนของฟังก์ชันช่วยเหลือภายใน (Private Helper Methods) -----------------

  /**
   * เพิ่ม userId และ socketId เข้าไปใน Map ของผู้ใช้ที่เชื่อมต่อ
   * จัดการกรณีที่ user มีหลาย tab/device เชื่อมต่อพร้อมกัน
   * @param userId - รหัส user
   * @param socketId - รหัส socket ที่เชื่อมต่อ
   */
  private addConnectedUser(userId: string, socketId: string): void {
    // ตรวจสอบว่ามี userId นี้ใน Map แล้วหรือยัง
    if (!this.connectedUsers.has(userId)) {
      // ถ้ายังไม่มี ให้สร้าง Set ใหม่สำหรับเก็บ socketId ของ user นี้
      this.connectedUsers.set(userId, new Set());
    }
    
    // เพิ่ม socketId เข้าไปใน Set ของ userId นี้
    this.connectedUsers.get(userId)!.add(socketId);
  }

  /**
   * ลบ socketId ออกจาก userId ที่ระบุ
   * ใช้เมื่อ socket ตัดการเชื่อมต่อ
   * @param userId - รหัส user
   * @param socketId - รหัส socket ที่จะลบ
   */
  private removeConnectedUser(userId: string, socketId: string): void {
    // ดึง Set ของ socketId ที่เชื่อมกับ userId นี้
    const userSockets = this.connectedUsers.get(userId);
    
    // ตรวจสอบว่า Set มีอยู่จริง
    if (userSockets) {
      // ลบ socketId ออกจาก Set
      userSockets.delete(socketId);
      
      // ถ้า Set ว่างเปล่าแล้ว (ไม่มี socket เหลือ) ให้ลบ userId ออกจาก Map
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }
  }

  /**
   * เพิ่มข้อมูลว่า socket ที่ระบุอยู่ในห้องไหน
   * ใช้สำหรับติดตามว่าแต่ละ socket เข้าร่วมห้องอะไรบ้าง
   * @param socketId - รหัส socket
   * @param roomId - รหัสห้องที่เข้าร่วม
   */
  private addUserToRoom(socketId: string, roomId: string): void {
    // ตรวจสอบว่ามี socketId นี้ใน Map แล้วหรือยัง
    if (!this.userRooms.has(socketId)) {
      // ถ้ายังไม่มี ให้สร้าง Set ใหม่สำหรับเก็บ roomId ของ socket นี้
      this.userRooms.set(socketId, new Set());
    }
    
    // เพิ่ม roomId เข้าไปใน Set ของ socketId นี้
    this.userRooms.get(socketId)!.add(roomId);
  }

  /**
   * ลบข้อมูลการเข้าร่วมห้องของ socket ที่ระบุ
   * ใช้เมื่อ socket ออกจากห้อง
   * @param socketId - รหัส socket
   * @param roomId - รหัสห้องที่ออกจาก
   */
  private removeUserFromRoom(socketId: string, roomId: string): void {
    // ดึง Set ของ roomId ที่เชื่อมกับ socketId นี้
    const socketRooms = this.userRooms.get(socketId);
    
    // ตรวจสอบว่า Set มีอยู่จริง
    if (socketRooms) {
      // ลบ roomId ออกจาก Set
      socketRooms.delete(roomId);
    }
  }

  /**
   * ลบ socketId ออกจากข้อมูลทุกห้องที่เข้าร่วม
   * ใช้เมื่อ socket ตัดการเชื่อมต่อ
   * @param socketId - รหัส socket ที่จะลบ
   */
  private removeUserFromAllRooms(socketId: string): void {
    // ลบ socketId ออกจาก Map ทั้งหมด
    this.userRooms.delete(socketId);
  }

  /**
   * ตรวจสอบสิทธิ์ว่า user สามารถเข้าร่วมห้องแชทที่ระบุได้หรือไม่
   * ป้องกันการเข้าห้องที่ไม่มีสิทธิ์
   * @param userId - รหัส user ที่ต้องการเข้าห้อง
   * @param otherUserId - รหัส user อีกคนในการสนทนา
   * @param roomId - รหัสห้องที่ต้องการเข้า
   * @returns true ถ้ามีสิทธิ์, false ถ้าไม่มีสิทธิ์
   */
  private canUserJoinRoom(userId: string, otherUserId: string, roomId: string): boolean {
    // ตรวจสอบเบื้องต้นว่ามีข้อมูลครบถ้วน
    if (!userId || !otherUserId) return false; // ถ้าขาดข้อมูลให้ปฏิเสธ
    
    // สร้าง roomId มาตรฐานจาก userId ทั้งสองคน (เรียงตัวอักษร)
    const expectedRoomId = [userId, otherUserId].sort().join('-');
    
    // ตรวจสอบว่า roomId ที่ขอเข้าตรงกับมาตรฐานหรือมี userId ของผู้ขออยู่
    return roomId === expectedRoomId || roomId.includes(userId);
  }
}