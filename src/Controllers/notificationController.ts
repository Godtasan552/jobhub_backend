import { Response } from 'express'; // นำเข้า Response สำหรับตอบกลับ API
import { AuthRequest, INotification, INotificationModel } from '@/types/index'; // นำเข้า type ที่เกี่ยวข้องกับ Notification
import Notification from '../Models/Nontification'; // นำเข้าโมเดล Notification
import { responseHelper } from '@/utils/responseHelper'; // นำเข้า helper สำหรับตอบกลับ API
import { catchAsync } from '../Middleware/errorHandler'; // นำเข้า middleware สำหรับจัดการ error
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '@/utils/constants'; // นำเข้าข้อความคงที่
import { SocketService } from '@/config/socket'; // นำเข้า service สำหรับ socket

export class NotificationController {
  private socketService = SocketService.getInstance(); // สร้าง instance สำหรับ socket service

  /**
   * ดึง notification ทั้งหมดของผู้ใช้ปัจจุบัน
   */
  getNotifications = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId จาก token
    const {
      page = 1, // หน้าเริ่มต้น
      limit = 20, // จำนวนต่อหน้า
      type, // ประเภท notification
      read // สถานะอ่าน/ยังไม่อ่าน
    } = req.query;

    // สร้าง options สำหรับ query
    const options = {
      page: Number(page),
      limit: Number(limit),
      type: type ? (Array.isArray(type) ? type : [type]) : undefined,
      read: read !== undefined ? read === 'true' : undefined
    };

    // ดึง notification ตาม options
    const notifications = await (Notification as any).findByUser(userId, options);
    
    // นับจำนวนทั้งหมด
    const total = await Notification.countDocuments({
      userId,
      ...(options.type && { type: { $in: options.type } }),
      ...(typeof options.read === 'boolean' && { read: options.read })
    });

    // ส่งข้อมูลแบบ paginated
    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      notifications,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * ดึงจำนวน notification ที่ยังไม่ได้อ่าน
   */
  getUnreadCount = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId

    // ดึงจำนวนที่ยังไม่ได้อ่านทั้งหมด
    const unreadCount = await (Notification as any).getUnreadCount(userId);
    // ดึงจำนวนที่ยังไม่ได้อ่านแยกตามประเภท
    const unreadByType = await (Notification as any).getUnreadCountByType(userId);

    // แปลง array เป็น object {type: count}
    const formattedByType = unreadByType.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    // ส่งข้อมูลกลับ
    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      total: unreadCount,
      byType: formattedByType
    });
  });

  /**
   * mark notification(s) ว่าอ่านแล้ว
   */
  markAsRead = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { notificationIds, type } = req.body; // รับ id หรือ type

    let updatedCount = 0; // ตัวแปรนับจำนวนที่อัพเดท

    if (notificationIds && notificationIds.length > 0) {
      // mark เฉพาะ id ที่ส่งมา
      updatedCount = await (Notification as any).markMultipleAsRead(notificationIds, userId);
    } else if (type) {
      // mark ทั้งหมดตาม type
      updatedCount = await (Notification as any).markAllAsRead(userId, type);
    } else {
      // mark ทั้งหมดของ user
      updatedCount = await (Notification as any).markAllAsRead(userId);
    }

    // ส่งผลลัพธ์กลับ
    responseHelper.success(res, SUCCESS_MESSAGES.NOTIFICATIONS_MARKED_READ, {
      updatedCount
    });
  });

  /**
   * mark notification ว่ายังไม่ได้อ่าน
   */
  markAsUnread = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { id } = req.params; // รับ id notification

    // ค้นหา notification
    const notification = await Notification.findOne({ _id: id, userId }) as INotification | null;
    
    if (!notification) {
      responseHelper.notFound(res, 'Notification not found');
      return;
    }

    // อัพเดทสถานะเป็นยังไม่ได้อ่าน
    notification.read = false;
    notification.readAt = null;
    await notification.save();

    responseHelper.success(res, 'Notification marked as unread');
  });

  /**
   * ลบ notification เดี่ยว
   */
  deleteNotification = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { id } = req.params; // รับ id notification

    // ลบ notification
    const notification = await Notification.findOneAndDelete({ _id: id, userId });
    
    if (!notification) {
      responseHelper.notFound(res, 'Notification not found');
      return;
    }

    responseHelper.success(res, 'Notification deleted successfully');
  });

  /**
   * ลบ notification หลายรายการ
   */
  deleteMultipleNotifications = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { notificationIds } = req.body; // รับ array id

    if (!notificationIds || notificationIds.length === 0) {
      responseHelper.error(res, 'Notification IDs are required', 400);
      return;
    }

    // ลบ notification ตาม id ที่ส่งมา
    const result = await Notification.deleteMany({
      _id: { $in: notificationIds },
      userId
    });

    responseHelper.success(res, 'Notifications deleted successfully', {
      deletedCount: result.deletedCount
    });
  });

  /**
   * ลบ notification ที่อ่านแล้วทั้งหมด
   */
  clearReadNotifications = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId

    // ลบ notification ที่ read = true
    const result = await Notification.deleteMany({
      userId,
      read: true
    });

    responseHelper.success(res, SUCCESS_MESSAGES.NOTIFICATIONS_CLEARED, {
      deletedCount: result.deletedCount
    });
  });

  /**
   * ดึงสถิติ notification
   */
  getNotificationStats = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId

    // ดึงสถิติรวม
    const stats = await (Notification as any).getNotificationStats(userId);

    // ดึง activity 7 วันล่าสุด
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // aggregate หาจำนวนแต่ละวันและแต่ละ type
    const recentActivity = await Notification.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$type"
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.date": -1 }
      }
    ]);

    // ส่งข้อมูลกลับ
    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      ...stats,
      recentActivity
    });
  });

  /**
   * อัพเดท preferences การแจ้งเตือน (mock)
   */
  updatePreferences = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { preferences } = req.body; // รับ preferences

    // ตัวอย่าง mock (จริงๆควรบันทึกลง DB)
    responseHelper.success(res, 'Notification preferences updated', preferences);
  });

  /**
   * ดึง notification ตาม id
   */
  getNotificationById = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { id } = req.params; // รับ id notification

    // ค้นหา notification
    const notification = await Notification.findOne({ _id: id, userId }) as INotification | null;
    
    if (!notification) {
      responseHelper.notFound(res, 'Notification not found');
      return;
    }

    // ถ้ายังไม่ได้อ่าน ให้ mark ว่าอ่านแล้ว
    if (!notification.read) {
      if (typeof notification.markAsRead === 'function') {
        await notification.markAsRead();
      } else {
        // ถ้าไม่มี method ให้ update เอง
        notification.read = true;
        notification.readAt = new Date();
        await notification.save();
      }
    }

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, notification);
  });

  /**
   * ส่ง notification ทดสอบ (สำหรับ dev/admin)
   */
  sendTestNotification = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { title, message, type = 'system' } = req.body; // รับข้อมูล

    // สร้าง notification ใหม่
    const notification = await Notification.create({
      userId,
      type,
      title: title || 'Test Notification',
      message: message || 'This is a test notification',
      read: false
    }) as INotification;

    // ส่งแจ้งเตือนแบบ real-time
    if (typeof this.socketService.sendNotificationToUser === 'function') {
      this.socketService.sendNotificationToUser(userId, {
        type,
        title: notification.title,
        message: notification.message,
        data: { notificationId: notification._id }
      });
    }

    responseHelper.created(res, 'Test notification sent', notification);
  });

  /**
   * Snooze notification (mark as read ชั่วคราว)
   */
  snoozeNotification = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { id } = req.params; // รับ id notification
    const { minutes = 60 } = req.body; // ระยะเวลาที่ snooze

    // ค้นหา notification
    const notification = await Notification.findOne({ _id: id, userId }) as INotification | null;
    
    if (!notification) {
      responseHelper.notFound(res, 'Notification not found');
      return;
    }

    // mark ว่าอ่านแล้ว (จริงๆควรตั้ง job ให้ mark ว่ายังไม่ได้อ่านหลังครบเวลา)
    if (typeof notification.markAsRead === 'function') {
      await notification.markAsRead();
    } else {
      notification.read = true;
      notification.readAt = new Date();
      await notification.save();
    }

    // หมายเหตุ: ในระบบจริงควรตั้ง job ให้ mark ว่ายังไม่ได้อ่านหลัง snooze ครบเวลา

    responseHelper.success(res, `Notification snoozed for ${minutes} minutes`);
  });

  /**
   * ดึง notification ตามประเภท
   */
  getNotificationsByType = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { type } = req.params; // ประเภท notification
    const { page = 1, limit = 20, read } = req.query; // รับ query

    // ตรวจสอบประเภทที่รองรับ
    const validTypes = ['job', 'milestone', 'payment', 'chat', 'system'];
    if (!validTypes.includes(type)) {
      responseHelper.error(res, 'Invalid notification type', 400);
      return;
    }

    // สร้าง options สำหรับ query
    const options = {
      page: Number(page),
      limit: Number(limit),
      type: [type],
      read: read !== undefined ? read === 'true' : undefined
    };

    // ดึง notification ตาม type
    const notifications = await (Notification as any).findByUser(userId, options);
    
    // นับจำนวนทั้งหมด
    const total = await Notification.countDocuments({
      userId,
      type,
      ...(typeof options.read === 'boolean' && { read: options.read })
    });

    // ส่งข้อมูลแบบ paginated
    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      notifications,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * จัดการ bulk operation กับ notification
   */
  bulkOperations = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { operation, notificationIds, filters } = req.body; // รับ operation, id, filter

    let result: any = {};

    switch (operation) {
      case 'mark_read':
        if (notificationIds) {
          // mark หลายรายการว่าอ่านแล้ว
          result.updatedCount = await (Notification as any).markMultipleAsRead(notificationIds, userId);
        } else {
          // mark ทั้งหมดตาม filter
          result.updatedCount = await (Notification as any).markAllAsRead(userId, filters?.type);
        }
        break;

      case 'delete':
        if (notificationIds) {
          // ลบหลายรายการตาม id
          result = await Notification.deleteMany({
            _id: { $in: notificationIds },
            userId
          });
        } else if (filters) {
          // ลบตาม filter
          result = await Notification.deleteMany({
            userId,
            ...filters
          });
        }
        break;

      case 'mark_unread':
        if (notificationIds) {
          // mark หลายรายการว่ายังไม่ได้อ่าน
          result = await Notification.updateMany(
            {
              _id: { $in: notificationIds },
              userId
            },
            {
              read: false,
              readAt: null
            }
          );
          result.updatedCount = result.modifiedCount || 0;
        }
        break;

      default:
        responseHelper.error(res, 'Invalid operation', 400);
        return;
    }

    responseHelper.success(res, `Bulk ${operation} completed`, result);
  });
}