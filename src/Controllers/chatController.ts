import { Response } from 'express'; // นำเข้า Response สำหรับตอบกลับ API
import { AuthRequest, IMessage, IUser, IJob, INotificationModel } from '@/types/index'; // นำเข้า type ที่เกี่ยวข้อง
import Message from '../Models/Message'; // นำเข้าโมเดล Message
import User from '../Models/User'; // นำเข้าโมเดล User
import Job from '../Models/Job'; // นำเข้าโมเดล Job
import Notification from '../Models/Nontification'; // นำเข้าโมเดล Notification
import { responseHelper } from '@/utils/responseHelper'; // นำเข้า helper สำหรับตอบกลับ API
import { catchAsync } from '../Middleware/errorHandler'; // นำเข้า middleware สำหรับจัดการ error
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '@/utils/constants'; // นำเข้าข้อความคงที่
import { SocketService } from '@/config/socket'; // นำเข้า service สำหรับ socket

export class ChatController {
  private socketService = SocketService.getInstance(); // สร้าง instance สำหรับ socket service

  /**
   * ดึงรายชื่อห้องสนทนาทั้งหมดของผู้ใช้ปัจจุบัน
   */
  getConversations = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId จาก token

    const conversations = await (Message as any).findUserConversations(userId); // ดึงห้องสนทนาทั้งหมด

    // จัดรูปแบบข้อมูลห้องสนทนา
    const formattedConversations = conversations.map((conv: any) => ({
      id: conv._id, // id ห้อง
      otherUser: conv.otherUser[0], // ข้อมูลผู้สนทนาอีกฝั่ง
      job: conv.job[0] || null, // ข้อมูลงาน (ถ้ามี)
      lastMessage: {
        content: conv.lastMessage, // ข้อความล่าสุด
        type: conv.lastMessageType, // ประเภทข้อความล่าสุด
        time: conv.lastMessageTime // เวลาข้อความล่าสุด
      },
      unreadCount: conv.unreadCount, // จำนวนข้อความที่ยังไม่ได้อ่าน
      totalMessages: conv.totalMessages // จำนวนข้อความทั้งหมด
    }));

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, formattedConversations); // ส่งข้อมูลกลับ
  });

  /**
   * ดึงข้อความในห้องสนทนาเฉพาะระหว่าง user สองคน (และงาน)
   */
  getConversation = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { otherUserId } = req.params; // รับ id อีกฝั่ง
    const { 
      page = 1, 
      limit = 50, 
      jobId 
    } = req.query; // รับ query

    // ตรวจสอบว่าผู้ใช้อีกฝั่งมีอยู่จริง
    const otherUser = await User.findById(otherUserId) as IUser | null;
    if (!otherUser) {
      responseHelper.notFound(res, 'User not found');
      return;
    }

    // ดึงข้อความระหว่าง user สองคน (และงานถ้ามี)
    const messages = await (Message as any).findConversation(
      userId,
      otherUserId,
      jobId as string,
      {
        page: Number(page),
        limit: Number(limit),
        sort: '-createdAt' // เรียงล่าสุดก่อน
      }
    );

    // เพิ่ม field isFromMe และเรียงลำดับจากเก่าไปใหม่
    const messagesWithDirection = messages
      .map((message: IMessage) => {
        const msg = message.toJSON();
        msg.isFromMe = msg.fromUserId.toString() === userId;
        return msg;
      })
      .reverse();

    // นับจำนวนข้อความทั้งหมด
    const totalMessages = await Message.countDocuments({
      $or: [
        { fromUserId: userId, toUserId: otherUserId },
        { fromUserId: otherUserId, toUserId: userId }
      ],
      ...(jobId && { jobId })
    });

    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      messagesWithDirection,
      Number(page),
      Number(limit),
      totalMessages
    );
  });

  /**
   * ส่งข้อความใหม่
   */
  sendMessage = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const fromUserId = req.user!._id; // ผู้ส่ง
    const { toUserId, message, messageType = 'text', jobId, attachment } = req.body; // รับข้อมูล

    // ตรวจสอบห้ามส่งหาตัวเอง
    if (fromUserId === toUserId) {
      responseHelper.error(res, ERROR_MESSAGES.CANNOT_MESSAGE_SELF || 'Cannot send message to yourself', 400);
      return;
    }

    // ตรวจสอบผู้รับ
    const toUser = await User.findById(toUserId) as IUser | null;
    if (!toUser) {
      responseHelper.notFound(res, 'Recipient not found');
      return;
    }

    // ถ้ามี jobId ให้ตรวจสอบความเกี่ยวข้อง
    let job: IJob | null = null;
    if (jobId) {
      job = await Job.findById(jobId) as IJob | null;
      if (!job) {
        responseHelper.notFound(res, 'Job not found');
        return;
      }

      // ตรวจสอบว่าทั้งสอง user เกี่ยวข้องกับงานนี้หรือไม่
      const isRelated = job.employerId.toString() === fromUserId ||
                       job.workerId?.toString() === fromUserId ||
                       job.applicants.includes(fromUserId) ||
                       job.employerId.toString() === toUserId ||
                       job.workerId?.toString() === toUserId ||
                       job.applicants.includes(toUserId);

      if (!isRelated) {
        responseHelper.error(res, 'Cannot message about this job', 403);
        return;
      }
    }

    // สร้างข้อความใหม่
    const newMessage = new Message({
      fromUserId,
      toUserId,
      jobId: jobId || null,
      message,
      messageType,
      attachment
    });

    await newMessage.save(); // บันทึกข้อความ

    // ดึงข้อมูลที่ populate สำหรับตอบกลับ
    await newMessage.populate([
      { path: 'fromUserId', select: 'name email profilePic' },
      { path: 'toUserId', select: 'name email profilePic' },
      { path: 'jobId', select: 'title' }
    ]);

    const populatedMessage = newMessage as IMessage;

    // สร้าง notification ให้ผู้รับ
    await (Notification as INotificationModel).createChatNotification(
      toUserId,
      populatedMessage._id,
      'New Message',
      message.length > 50 ? `${message.substring(0, 50)}...` : message,
      `/chat/${fromUserId}`
    );

    // ส่งข้อความแบบ real-time ผ่าน socket (ถ้ามี method)
    if (typeof this.socketService.sendToRoom === 'function' && typeof populatedMessage.getChatRoomId === 'function') {
      const roomId = populatedMessage.getChatRoomId();
      this.socketService.sendToRoom(`chat:${roomId}`, 'receive_message', {
        ...populatedMessage.toJSON(),
        isFromMe: false
      });
    }

    // ส่ง notification ผ่าน socket
    if (typeof this.socketService.sendNotificationToUser === 'function') {
      this.socketService.sendNotificationToUser(toUserId, {
        type: 'chat',
        title: 'New Message',
        message: `Message from ${req.user!.name}`,
        data: { messageId: populatedMessage._id, fromUserId }
      });
    }

    const messageResponse = populatedMessage.toJSON();
    messageResponse.isFromMe = true; // ตอบกลับฝั่งผู้ส่ง

    responseHelper.created(res, SUCCESS_MESSAGES.MESSAGE_SENT, messageResponse); // ส่งข้อมูลกลับ
  });

  /**
   * mark ข้อความว่าอ่านแล้ว
   */
  markMessagesAsRead = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้
    const { messageIds } = req.body; // รับ id ข้อความ

    const updatedCount = await (Message as any).markMultipleAsRead(messageIds, userId); // mark ว่าอ่านแล้ว

    // แจ้งเตือน sender ผ่าน socket ว่าข้อความถูกอ่าน
    if (updatedCount > 0) {
      const messages = await Message.find({ _id: { $in: messageIds } }) as IMessage[];
      const uniqueSenders = [...new Set(messages.map((msg: IMessage) => msg.fromUserId.toString()))];
      
      for (const senderId of uniqueSenders) {
        if (senderId !== userId && typeof this.socketService.sendToRoom === 'function') {
          this.socketService.sendToRoom(`user:${senderId}`, 'messages_read', {
            userId,
            messageIds: messages
              .filter((msg: IMessage) => msg.fromUserId.toString() === senderId)
              .map((msg: IMessage) => msg._id)
          });
        }
      }
    }

    responseHelper.success(res, SUCCESS_MESSAGES.MESSAGES_MARKED_READ, {
      updatedCount
    });
  });

  /**
   * ค้นหาข้อความในแชท
   */
  searchMessages = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้
    const { 
      q: searchTerm, 
      page = 1, 
      limit = 20, 
      jobId,
      withUserId 
    } = req.query; // รับ query

    if (!searchTerm) {
      responseHelper.error(res, 'Search term is required', 400);
      return;
    }

    // ค้นหาข้อความ
    const messages = await (Message as any).searchMessages(
      userId,
      searchTerm as string,
      {
        page: Number(page),
        limit: Number(limit),
        jobId: jobId as string,
        withUserId: withUserId as string
      }
    );

    // เพิ่ม field isFromMe
    const messagesWithDirection = messages.map((message: IMessage) => {
      const msg = message.toJSON();
      msg.isFromMe = msg.fromUserId.toString() === userId;
      return msg;
    });

    // นับจำนวนข้อความที่ค้นหาเจอ
    const total = await Message.countDocuments({
      $or: [
        { fromUserId: userId },
        { toUserId: userId }
      ],
      message: { $regex: searchTerm, $options: 'i' },
      ...(jobId && { jobId }),
      ...(withUserId && {
        $or: [
          { fromUserId: withUserId },
          { toUserId: withUserId }
        ]
      })
    });

    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      messagesWithDirection,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * ดึงจำนวนข้อความที่ยังไม่ได้อ่าน
   */
  getUnreadCount = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้

    const unreadCount = await (Message as any).getUnreadCount(userId); // ดึงจำนวนที่ยังไม่ได้อ่านทั้งหมด
    const unreadByConversation = await (Message as any).getUnreadCountPerConversation(userId); // ดึงแยกตามห้อง

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      total: unreadCount,
      byConversation: unreadByConversation
    });
  });

  /**
   * ลบข้อความ (เฉพาะผู้ส่ง และในเวลาที่กำหนด)
   */
  deleteMessage = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้
    const { id } = req.params; // รับ id ข้อความ

    const message = await Message.findById(id) as IMessage | null; // ค้นหาข้อความ
    if (!message) {
      responseHelper.notFound(res, ERROR_MESSAGES.MESSAGE_NOT_FOUND || 'Message not found');
      return;
    }

    if (message.fromUserId.toString() !== userId) {
      responseHelper.error(res, 'You can only delete your own messages', 403);
      return;
    }

    // ตรวจสอบว่าเกินเวลาลบหรือยัง (เช่น 1 ชั่วโมง)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (message.createdAt < oneHourAgo) {
      responseHelper.error(res, 'Message is too old to delete', 400);
      return;
    }

    if (message.read) {
      responseHelper.error(res, 'Cannot delete message that has been read', 400);
      return;
    }

    await Message.findByIdAndDelete(id); // ลบข้อความ

    // แจ้งเตือนผ่าน socket ถ้ามี method
    if (typeof this.socketService.sendToRoom === 'function' && typeof message.getChatRoomId === 'function') {
      const roomId = message.getChatRoomId();
      this.socketService.sendToRoom(`chat:${roomId}`, 'message_deleted', {
        messageId: id,
        fromUserId: userId
      });
    }

    responseHelper.success(res, 'Message deleted successfully');
  });

  /**
   * บล็อก/ปลดบล็อกผู้ใช้ (กันไม่ให้ส่งข้อความ)
   */
  toggleBlockUser = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้
    const { otherUserId } = req.params; // id อีกฝั่ง
    const { block } = req.body; // รับค่าบล็อก/ปลดบล็อก

    if (userId === otherUserId) {
      responseHelper.error(res, 'Cannot block yourself', 400);
      return;
    }

    const otherUser = await User.findById(otherUserId) as IUser | null; // ตรวจสอบผู้ใช้
    if (!otherUser) {
      responseHelper.notFound(res, 'User not found');
      return;
    }

    // หมายเหตุ: ต้องมี field blockedUsers ใน User model (ตัวอย่างนี้ mock)
    // สามารถเพิ่ม/ลบ id ใน blockedUsers ได้ที่นี่

    responseHelper.success(
      res, 
      block ? 'User blocked successfully' : 'User unblocked successfully'
    );
  });

  /**
   * ดึงสถิติข้อความ
   */
  getMessageStats = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้

    const stats = await (Message as any).getMessageStats(userId); // ดึงสถิติ

    // ดึงจำนวนห้องสนทนา
    const conversations = await (Message as any).findUserConversations(userId);
    const conversationCount = conversations.length;

    // ดึง 5 ห้องที่ active ที่สุด
    const activeConversations = await Message.aggregate([
      {
        $match: {
          $or: [{ fromUserId: userId }, { toUserId: userId }]
        }
      },
      {
        $addFields: {
          otherUserId: {
            $cond: {
              if: { $eq: ['$fromUserId', userId] },
              then: '$toUserId',
              else: '$fromUserId'
            }
          }
        }
      },
      {
        $group: {
          _id: '$otherUserId',
          messageCount: { $sum: 1 },
          lastMessageTime: { $max: '$createdAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $sort: { messageCount: -1 } },
      { $limit: 5 }
    ]);

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      ...(stats || {}),
      conversationCount,
      mostActiveConversations: activeConversations
    });
  });

  /**
   * เริ่มต้นห้องสนทนาใหม่ (ระบุ job ได้)
   */
  startConversation = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const fromUserId = req.user!._id; // ผู้เริ่มต้น
    const { toUserId, jobId, initialMessage } = req.body; // รับข้อมูล

    // ตรวจสอบผู้รับ
    const toUser = await User.findById(toUserId) as IUser | null;
    if (!toUser) {
      responseHelper.notFound(res, 'User not found');
      return;
    }

    // ตรวจสอบงานถ้ามี
    let job: IJob | null = null;
    if (jobId) {
      job = await Job.findById(jobId) as IJob | null;
      if (!job) {
        responseHelper.notFound(res, 'Job not found');
        return;
      }
    }

    // ตรวจสอบว่ามีห้องสนทนาอยู่แล้วหรือไม่
    const existingMessages = await (Message as any).findConversation(
      fromUserId,
      toUserId,
      jobId,
      { limit: 1 }
    );

    let conversation: any;
    if (existingMessages.length > 0) {
      // ถ้ามีแล้ว ส่งข้อมูลกลับ
      conversation = {
        exists: true,
        otherUser: toUser,
        job,
        messageCount: await Message.countDocuments({
          $or: [
            { fromUserId, toUserId },
            { fromUserId: toUserId, toUserId: fromUserId }
          ],
          ...(jobId && { jobId })
        })
      };
    } else {
      // ถ้ายังไม่มี ส่งข้อความแรก (ถ้ามี)
      if (initialMessage) {
        const newMessage = new Message({
          fromUserId,
          toUserId,
          jobId: jobId || null,
          message: initialMessage,
          messageType: 'text'
        });

        await newMessage.save();

        // สร้าง notification
        await (Notification as INotificationModel).createChatNotification(
          toUserId,
          newMessage._id,
          'New Conversation',
          initialMessage.length > 50 ? `${initialMessage.substring(0, 50)}...` : initialMessage,
          `/chat/${fromUserId}`
        );
      }

      conversation = {
        exists: false,
        otherUser: toUser,
        job,
        messageCount: initialMessage ? 1 : 0
      };
    }

    responseHelper.success(res, 'Conversation started', conversation);
  });
}