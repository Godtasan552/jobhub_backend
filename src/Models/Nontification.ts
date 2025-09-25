import mongoose, { Schema ,Document } from 'mongoose';
import { INotification } from '@/types/index';

// สร้าง schema สำหรับเก็บข้อมูลการแจ้งเตือนของผู้ใช้แต่ละคน
const NotificationSchema = new Schema<INotification>({
  // userId: อ้างอิงถึงผู้ใช้ที่ได้รับแจ้งเตือน
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  // type: ประเภทของแจ้งเตือน (งาน, milestone, การเงิน, แชท, ระบบ)
  type: {
    type: String,
    enum: {
      values: ['job', 'milestone', 'payment', 'chat', 'system'],
      message: 'Type must be one of: job, milestone, payment, chat, system'
    },
    required: [true, 'Notification type is required']
  },
  // title: หัวข้อแจ้งเตือน
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  // message: เนื้อหาของแจ้งเตือน
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  // referenceId: รหัสอ้างอิงถึงข้อมูลที่เกี่ยวข้อง (เช่น jobId, milestoneId ฯลฯ)
  referenceId: {
    type: String,
    default: null
  },
  // referenceType: ประเภทของข้อมูลที่อ้างอิง (job, milestone, transaction, message)
  referenceType: {
    type: String,
    enum: ['job', 'milestone', 'transaction', 'message'],
    default: null
  },
  // read: สถานะอ่านแจ้งเตือน
  read: {
    type: Boolean,
    default: false
  },
  // readAt: วันที่อ่านแจ้งเตือน
  readAt: {
    type: Date,
    default: null
  },
  // actionUrl: ลิงก์สำหรับนำไปยังหน้าที่เกี่ยวข้องกับแจ้งเตือน
  actionUrl: {
    type: String,
    default: null,
    maxlength: [500, 'Action URL cannot exceed 500 characters']
  }
}, {
  timestamps: true, // สร้าง createdAt / updatedAt อัตโนมัติ
  versionKey: false // ไม่สร้าง __v
});

// สร้าง index เพื่อให้ query แจ้งเตือนเร็วขึ้น
NotificationSchema.index({ userId: 1 });
NotificationSchema.index({ read: 1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });
NotificationSchema.index({ userId: 1, type: 1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

// ---------- Instance Methods ----------

// markAsRead: เปลี่ยนสถานะแจ้งเตือนเป็นอ่าน
NotificationSchema.methods.markAsRead = async function(): Promise<void> {
  if (!this.read) {
    this.read = true;
    this.readAt = new Date();
    await this.save();
  }
};

// markAsUnread: เปลี่ยนสถานะแจ้งเตือนเป็นยังไม่ได้อ่าน
NotificationSchema.methods.markAsUnread = async function(): Promise<void> {
  if (this.read) {
    this.read = false;
    this.readAt = null;
    await this.save();
  }
};

// ---------- Static Methods ----------

// findByUser: ค้นหาแจ้งเตือนของ user ตามเงื่อนไข (type, สถานะอ่าน, page, limit)
NotificationSchema.statics.findByUser = function(
  userId: string,
  options: any = {}
) {
  const {
    page = 1,
    limit = 20,
    type,
    read,
    sort = '-createdAt'
  } = options;

  let query: any = { userId };

  if (type) {
    if (Array.isArray(type)) {
      query.type = { $in: type };
    } else {
      query.type = type;
    }
  }

  if (typeof read === 'boolean') {
    query.read = read;
  }

  const skip = (page - 1) * limit;

  return this.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// getUnreadCount: นับจำนวนแจ้งเตือนที่ยังไม่ได้อ่านของ user
NotificationSchema.statics.getUnreadCount = async function(userId: string): Promise<number> {
  return await this.countDocuments({
    userId,
    read: false
  });
};

// getUnreadCountByType: นับจำนวนแจ้งเตือนที่ยังไม่ได้อ่านแยกตามประเภท
NotificationSchema.statics.getUnreadCountByType = async function(userId: string) {
  return await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        read: false
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);
};

// markAllAsRead: เปลี่ยนแจ้งเตือนทั้งหมดของ user เป็นอ่าน (เลือกเฉพาะ type ได้)
NotificationSchema.statics.markAllAsRead = async function(
  userId: string,
  type?: string
): Promise<number> {
  let query: any = { userId, read: false };
  
  if (type) {
    query.type = type;
  }

  const result = await this.updateMany(
    query,
    {
      read: true,
      readAt: new Date()
    }
  );

  return result.modifiedCount;
};

// markMultipleAsRead: เปลี่ยนแจ้งเตือนหลายอันเป็นอ่าน
NotificationSchema.statics.markMultipleAsRead = async function(
  notificationIds: string[],
  userId: string
): Promise<number> {
  const result = await this.updateMany(
    {
      _id: { $in: notificationIds },
      userId,
      read: false
    },
    {
      read: true,
      readAt: new Date()
    }
  );

  return result.modifiedCount;
};

// deleteOldNotifications: ลบแจ้งเตือนเก่าที่อ่านแล้วตามจำนวนวัน
NotificationSchema.statics.deleteOldNotifications = async function(
  userId: string,
  daysOld: number = 90
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await this.deleteMany({
    userId,
    read: true,
    createdAt: { $lt: cutoffDate }
  });

  return result.deletedCount;
};

// createJobNotification: สร้างแจ้งเตือนเกี่ยวกับงาน
NotificationSchema.statics.createJobNotification = async function(
  userId: string,
  jobId: string,
  title: string,
  message: string,
  actionUrl?: string
) {
  return await this.create({
    userId,
    type: 'job',
    title,
    message,
    referenceId: jobId,
    referenceType: 'job',
    actionUrl
  });
};

// createMilestoneNotification: สร้างแจ้งเตือนเกี่ยวกับ milestone
NotificationSchema.statics.createMilestoneNotification = async function(
  userId: string,
  milestoneId: string,
  title: string,
  message: string,
  actionUrl?: string
) {
  return await this.create({
    userId,
    type: 'milestone',
    title,
    message,
    referenceId: milestoneId,
    referenceType: 'milestone',
    actionUrl
  });
};

// createPaymentNotification: สร้างแจ้งเตือนเกี่ยวกับธุรกรรมการเงิน
NotificationSchema.statics.createPaymentNotification = async function(
  userId: string,
  transactionId: string,
  title: string,
  message: string,
  actionUrl?: string
) {
  return await this.create({
    userId,
    type: 'payment',
    title,
    message,
    referenceId: transactionId,
    referenceType: 'transaction',
    actionUrl
  });
};

// createChatNotification: สร้างแจ้งเตือนเกี่ยวกับข้อความแชท
NotificationSchema.statics.createChatNotification = async function(
  userId: string,
  messageId: string,
  title: string,
  message: string,
  actionUrl?: string
) {
  return await this.create({
    userId,
    type: 'chat',
    title,
    message,
    referenceId: messageId,
    referenceType: 'message',
    actionUrl
  });
};

// createSystemNotification: สร้างแจ้งเตือนระบบ
NotificationSchema.statics.createSystemNotification = async function(
  userId: string,
  title: string,
  message: string,
  actionUrl?: string
) {
  return await this.create({
    userId,
    type: 'system',
    title,
    message,
    actionUrl
  });
};

// broadcastSystemNotification: ส่งแจ้งเตือนระบบไปยังผู้ใช้หลายคน (หรือทุกคน)
NotificationSchema.statics.broadcastSystemNotification = async function(
  title: string,
  message: string,
  userIds?: string[],
  actionUrl?: string
) {
  let targetUsers = userIds;
  
  if (!targetUsers) {
    // ถ้าไม่ระบุ userIds จะส่งให้ผู้ใช้ที่ active ทุกคน
    const User = mongoose.model('User');
    const users = await User.find({ isActive: true }, '_id');
    targetUsers = users.map(user => user._id.toString());
  }

  const notifications = targetUsers.map(userId => ({
    userId,
    type: 'system',
    title,
    message,
    actionUrl
  }));

  return await this.insertMany(notifications);
};

// getNotificationStats: สถิติแจ้งเตือนของ user (แยกตามประเภท)
NotificationSchema.statics.getNotificationStats = async function(userId: string) {
  const stats = await this.aggregate([
    {
      $match: { userId: new mongoose.Types.ObjectId(userId) }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        unread: {
          $sum: {
            $cond: [{ $eq: ['$read', false] }, 1, 0]
          }
        }
      }
    }
  ]);

  const totalUnread = await this.countDocuments({ userId, read: false });

  return {
    totalUnread,
    byType: stats.reduce((acc, stat) => {
      acc[stat._id] = {
        total: stat.total,
        unread: stat.unread
      };
      return acc;
    }, {} as Record<string, { total: number; unread: number }>)
  };
};

// ---------- Virtual Properties ----------

// timeAgo: แสดงเวลาการแจ้งเตือนแบบ human readable (เช่น 2m ago)
NotificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const notificationTime = new Date(this.createdAt);
  const diffInSeconds = Math.floor((now.getTime() - notificationTime.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return `${Math.floor(diffInSeconds / 604800)}w ago`;
});

// icon: แสดงไอคอนตามประเภทแจ้งเตือน (ใช้สำหรับ UI)
NotificationSchema.virtual('icon').get(function() {
  const icons = {
    job: '💼',
    milestone: '🎯',
    payment: '💰',
    chat: '💬',
    system: '🔔'
  };
  return icons[this.type] || '📢';
});

// priority: ระดับความสำคัญของแจ้งเตือน (ใช้สำหรับ UI)
NotificationSchema.virtual('priority').get(function() {
  const priorities = {
    payment: 'high',
    milestone: 'high',
    job: 'medium',
    chat: 'low',
    system: 'low'
  };
  return priorities[this.type] || 'low';
});

// ---------- Middleware ----------

// pre-save: สร้าง actionUrl อัตโนมัติถ้ายังไม่มี โดยอิงจาก referenceType
NotificationSchema.pre('save', function(next) {
  if (!this.actionUrl && this.referenceId && this.referenceType) {
    switch (this.referenceType) {
      case 'job':
        this.actionUrl = `/jobs/${this.referenceId}`;
        break;
      case 'milestone':
        this.actionUrl = `/milestones/${this.referenceId}`;
        break;
      case 'transaction':
        this.actionUrl = `/wallet/transactions/${this.referenceId}`;
        break;
      case 'message':
        this.actionUrl = `/chat/${this.referenceId}`;
        break;
    }
  }
  
  next();
});

// ---------- Transform Output ----------

// toJSON: แปลง _id เป็น id และลบ __v
NotificationSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// สร้าง model สำหรับแจ้งเตือน
const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;