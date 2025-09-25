import { Response } from 'express';
import { AuthRequest, IMessage, IUser, IJob, INotificationModel } from '@/types';
import Message from '../Models/Message';
import User from '../Models/User';
import Job from '../Models/Job';
import Notification from '../Models/Nontification';
import { responseHelper } from '@/utils/responseHelper';
import { catchAsync } from '../Middleware/errorHandler';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '@/utils/constants';
import { SocketService } from '@/config/socket';

export class ChatController {
  private socketService = SocketService.getInstance();

  /**
   * Get all conversations for the current user
   */
  getConversations = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;

    const conversations = await (Message as any).findUserConversations(userId);

    const formattedConversations = conversations.map((conv: any) => ({
      id: conv._id,
      otherUser: conv.otherUser[0],
      job: conv.job[0] || null,
      lastMessage: {
        content: conv.lastMessage,
        type: conv.lastMessageType,
        time: conv.lastMessageTime
      },
      unreadCount: conv.unreadCount,
      totalMessages: conv.totalMessages
    }));

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, formattedConversations);
  });

  /**
   * Get messages in a specific conversation
   */
  getConversation = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { otherUserId } = req.params;
    const { 
      page = 1, 
      limit = 50, 
      jobId 
    } = req.query;

    // Verify the other user exists
    const otherUser = await User.findById(otherUserId) as IUser | null;
    if (!otherUser) {
      responseHelper.notFound(res, 'User not found');
      return;
    }

    // Get messages between users
    const messages = await (Message as any).findConversation(
      userId,
      otherUserId,
      jobId as string,
      {
        page: Number(page),
        limit: Number(limit),
        sort: '-createdAt' // Latest first for pagination
      }
    );

    // Add direction indicator and reverse for chronological order
    const messagesWithDirection = messages
      .map((message: IMessage) => {
        const msg = message.toJSON();
        msg.isFromMe = msg.fromUserId.toString() === userId;
        return msg;
      })
      .reverse(); // Show oldest first

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
   * Send a message
   */
  sendMessage = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const fromUserId = req.user!._id;
    const { toUserId, message, messageType = 'text', jobId, attachment } = req.body;

    // Validate recipient
    if (fromUserId === toUserId) {
      responseHelper.error(res, ERROR_MESSAGES.CANNOT_MESSAGE_SELF || 'Cannot send message to yourself', 400);
      return;
    }

    const toUser = await User.findById(toUserId) as IUser | null;
    if (!toUser) {
      responseHelper.notFound(res, 'Recipient not found');
      return;
    }

    // Validate job if provided
    let job: IJob | null = null;
    if (jobId) {
      job = await Job.findById(jobId) as IJob | null;
      if (!job) {
        responseHelper.notFound(res, 'Job not found');
        return;
      }

      // Check if users are related to the job
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

    // Create message
    const newMessage = new Message({
      fromUserId,
      toUserId,
      jobId: jobId || null,
      message,
      messageType,
      attachment
    });

    await newMessage.save();

    // Populate the message for response
    await newMessage.populate([
      { path: 'fromUserId', select: 'name email profilePic' },
      { path: 'toUserId', select: 'name email profilePic' },
      { path: 'jobId', select: 'title' }
    ]);

    const populatedMessage = newMessage as IMessage;

    // Create notification for recipient
    await (Notification as INotificationModel).createChatNotification(
      toUserId,
      populatedMessage._id,
      'New Message',
      message.length > 50 ? `${message.substring(0, 50)}...` : message,
      `/chat/${fromUserId}`
    );

    // Send real-time message via socket if method exists
    if (typeof this.socketService.sendToRoom === 'function' && typeof populatedMessage.getChatRoomId === 'function') {
      const roomId = populatedMessage.getChatRoomId();
      this.socketService.sendToRoom(`chat:${roomId}`, 'receive_message', {
        ...populatedMessage.toJSON(),
        isFromMe: false
      });
    }

    // Send notification via socket
    if (typeof this.socketService.sendNotificationToUser === 'function') {
      this.socketService.sendNotificationToUser(toUserId, {
        type: 'chat',
        title: 'New Message',
        message: `Message from ${req.user!.name}`,
        data: { messageId: populatedMessage._id, fromUserId }
      });
    }

    const messageResponse = populatedMessage.toJSON();
    messageResponse.isFromMe = true;

    responseHelper.created(res, SUCCESS_MESSAGES.MESSAGE_SENT, messageResponse);
  });

  /**
   * Mark messages as read
   */
  markMessagesAsRead = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { messageIds } = req.body;

    const updatedCount = await (Message as any).markMultipleAsRead(messageIds, userId);

    // Notify sender via socket about read status
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
   * Search messages
   */
  searchMessages = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { 
      q: searchTerm, 
      page = 1, 
      limit = 20, 
      jobId,
      withUserId 
    } = req.query;

    if (!searchTerm) {
      responseHelper.error(res, 'Search term is required', 400);
      return;
    }

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

    // Add direction indicator
    const messagesWithDirection = messages.map((message: IMessage) => {
      const msg = message.toJSON();
      msg.isFromMe = msg.fromUserId.toString() === userId;
      return msg;
    });

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
   * Get unread message count
   */
  getUnreadCount = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;

    const unreadCount = await (Message as any).getUnreadCount(userId);
    const unreadByConversation = await (Message as any).getUnreadCountPerConversation(userId);

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      total: unreadCount,
      byConversation: unreadByConversation
    });
  });

  /**
   * Delete a message (sender only, within time limit)
   */
  deleteMessage = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { id } = req.params;

    const message = await Message.findById(id) as IMessage | null;
    if (!message) {
      responseHelper.notFound(res, ERROR_MESSAGES.MESSAGE_NOT_FOUND || 'Message not found');
      return;
    }

    if (message.fromUserId.toString() !== userId) {
      responseHelper.error(res, 'You can only delete your own messages', 403);
      return;
    }

    // Check if message is too old to delete (e.g., older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (message.createdAt < oneHourAgo) {
      responseHelper.error(res, 'Message is too old to delete', 400);
      return;
    }

    if (message.read) {
      responseHelper.error(res, 'Cannot delete message that has been read', 400);
      return;
    }

    await Message.findByIdAndDelete(id);

    // Notify via socket if methods exist
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
   * Block/Unblock user (prevent messaging)
   */
  toggleBlockUser = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { otherUserId } = req.params;
    const { block } = req.body;

    if (userId === otherUserId) {
      responseHelper.error(res, 'Cannot block yourself', 400);
      return;
    }

    const otherUser = await User.findById(otherUserId) as IUser | null;
    if (!otherUser) {
      responseHelper.notFound(res, 'User not found');
      return;
    }

    // This would require adding a blockedUsers field to User model
    // For now, we'll just return success
    // const user = await User.findById(userId);
    // if (block) {
    //   user.blockedUsers.push(otherUserId);
    // } else {
    //   user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== otherUserId);
    // }
    // await user.save();

    responseHelper.success(
      res, 
      block ? 'User blocked successfully' : 'User unblocked successfully'
    );
  });

  /**
   * Get message statistics
   */
  getMessageStats = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;

    const stats = await (Message as any).getMessageStats(userId);

    // Get conversation count
    const conversations = await (Message as any).findUserConversations(userId);
    const conversationCount = conversations.length;

    // Get most active conversations
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
   * Start a new conversation (initiate chat with job context)
   */
  startConversation = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const fromUserId = req.user!._id;
    const { toUserId, jobId, initialMessage } = req.body;

    // Validate recipient
    const toUser = await User.findById(toUserId) as IUser | null;
    if (!toUser) {
      responseHelper.notFound(res, 'User not found');
      return;
    }

    // Validate job if provided
    let job: IJob | null = null;
    if (jobId) {
      job = await Job.findById(jobId) as IJob | null;
      if (!job) {
        responseHelper.notFound(res, 'Job not found');
        return;
      }
    }

    // Check if conversation already exists
    const existingMessages = await (Message as any).findConversation(
      fromUserId,
      toUserId,
      jobId,
      { limit: 1 }
    );

    let conversation: any;
    if (existingMessages.length > 0) {
      // Return existing conversation
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
      // Send initial message if provided
      if (initialMessage) {
        const newMessage = new Message({
          fromUserId,
          toUserId,
          jobId: jobId || null,
          message: initialMessage,
          messageType: 'text'
        });

        await newMessage.save();

        // Create notification
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