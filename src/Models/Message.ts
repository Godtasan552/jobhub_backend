import mongoose, { Schema, Document } from 'mongoose';
import { IMessage } from '@/types/typese';

// สร้าง schema สำหรับเก็บข้อความแชท
const MessageSchema = new Schema<IMessage>({
    // ผู้ส่ง
    fromUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'From user ID is required']
    },
    // ผู้รับ
    toUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'To user ID is required']
    },
    // อ้างอิงงาน (ถ้ามี)
    jobId: {
        type: Schema.Types.ObjectId,
        ref: 'Job',
        default: null
    },
    // เนื้อหาข้อความ
    message: {
        type: String,
        required: [true, 'Message content is required'],
        trim: true,
        minlength: [1, 'Message cannot be empty'],
        maxlength: [2000, 'Message cannot exceed 2000 characters']
    },
    // ประเภทข้อความ (text, file, image)
    messageType: {
        type: String,
        enum: {
            values: ['text', 'file', 'image'],
            message: 'Message type must be one of: text, file, image'
        },
        default: 'text'
    },
    // ไฟล์แนบ (ถ้ามี)
    attachment: {
        type: String,
        default: null,
        validate: {
            // ถ้า messageType เป็น text ห้ามมี attachment
            validator: function (this: IMessage, value: string): boolean {
                return !value || (this.messageType !== 'text');
            },
            message: 'Attachment can only be set for non-text messages'
        }
    },
    // สถานะอ่าน
    read: {
        type: Boolean,
        default: false
    },
    // วันที่อ่าน
    readAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true, // สร้าง createdAt / updatedAt อัตโนมัติ
    versionKey: false // ไม่สร้าง __v
});

// สร้าง index เพื่อให้ query เร็วขึ้น
MessageSchema.index({ fromUserId: 1 });
MessageSchema.index({ toUserId: 1 });
MessageSchema.index({ jobId: 1 });
MessageSchema.index({ read: 1 });
MessageSchema.index({ createdAt: -1 });
MessageSchema.index({ fromUserId: 1, toUserId: 1 }); // index สำหรับหาคู่สนทนา
MessageSchema.index({ toUserId: 1, read: 1 }); // index สำหรับหาข้อความที่ยังไม่ได้อ่าน
MessageSchema.index({ jobId: 1, createdAt: -1 }); // index สำหรับแชทในงาน

// ---------- Instance Methods ----------

// markAsRead: เปลี่ยนสถานะข้อความเป็นอ่าน
MessageSchema.methods.markAsRead = async function (): Promise<void> {
    if (!this.read) {
        this.read = true;
        this.readAt = new Date();
        await this.save();
    }
};

// canBeModified: เช็คว่าข้อความนี้แก้ไข/ลบได้ไหม (ต้องเป็นเจ้าของและยังไม่ได้อ่าน)
MessageSchema.methods.canBeModified = function (userId: string): boolean {
    return this.fromUserId.toString() === userId && !this.read;
};

// getChatRoomId: สร้างรหัสห้องแชท (ใช้ userId ทั้งสองและ jobId ถ้ามี)
MessageSchema.methods.getChatRoomId = function (): string {
    const userIds = [this.fromUserId.toString(), this.toUserId.toString()].sort();
    return this.jobId ? `${userIds.join('-')}-${this.jobId}` : userIds.join('-');
};

// ---------- Static Methods ----------

// findConversation: หาข้อความระหว่าง user1 กับ user2 (optionally by job)
MessageSchema.statics.findConversation = function (
    user1Id: string,
    user2Id: string,
    jobId?: string,
    options: any = {}
) {
    const {
        page = 1,
        limit = 50,
        sort = '-createdAt'
    } = options;

    let query: any = {
        $or: [
            { fromUserId: user1Id, toUserId: user2Id },
            { fromUserId: user2Id, toUserId: user1Id }
        ]
    };

    if (jobId) {
        query.jobId = jobId;
    }

    const skip = (page - 1) * limit;

    return this.find(query)
        .populate('fromUserId', 'name email profilePic')
        .populate('toUserId', 'name email profilePic')
        .populate('jobId', 'title')
        .sort(sort)
        .skip(skip)
        .limit(limit);
};

// findUserConversations: หาทุกห้องแชทของ user (รวม unread count)
MessageSchema.statics.findUserConversations = async function (userId: string) {
    const conversations = await this.aggregate([
        {
            $match: {
                $or: [
                    { fromUserId: new mongoose.Types.ObjectId(userId) },
                    { toUserId: new mongoose.Types.ObjectId(userId) }
                ]
            }
        },
        {
            $addFields: {
                otherUserId: {
                    $cond: {
                        if: { $eq: ['$fromUserId', new mongoose.Types.ObjectId(userId)] },
                        then: '$toUserId',
                        else: '$fromUserId'
                    }
                }
            }
        },
        {
            $group: {
                _id: {
                    otherUserId: '$otherUserId',
                    jobId: '$jobId'
                },
                lastMessage: { $first: '$message' },
                lastMessageType: { $first: '$messageType' },
                lastMessageTime: { $first: '$createdAt' },
                unreadCount: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ['$toUserId', new mongoose.Types.ObjectId(userId)] },
                                    { $eq: ['$read', false] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                },
                totalMessages: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: '_id.otherUserId',
                foreignField: '_id',
                as: 'otherUser'
            }
        },
        {
            $lookup: {
                from: 'jobs',
                localField: '_id.jobId',
                foreignField: '_id',
                as: 'job'
            }
        },
        {
            $sort: { lastMessageTime: -1 }
        }
    ]);

    return conversations;
};

// markMultipleAsRead: เปลี่ยนข้อความหลายอันเป็นอ่าน
MessageSchema.statics.markMultipleAsRead = async function (
    messageIds: string[],
    userId: string
): Promise<number> {
    const result = await this.updateMany(
        {
            _id: { $in: messageIds },
            toUserId: userId,
            read: false
        },
        {
            read: true,
            readAt: new Date()
        }
    );

    return result.modifiedCount;
};

// getUnreadCount: นับจำนวนข้อความที่ยังไม่ได้อ่านของ user
MessageSchema.statics.getUnreadCount = async function (userId: string): Promise<number> {
    return await this.countDocuments({
        toUserId: userId,
        read: false
    });
};

// getUnreadCountPerConversation: นับจำนวน unread ต่อห้องแชท
MessageSchema.statics.getUnreadCountPerConversation = async function (userId: string) {
    return await this.aggregate([
        {
            $match: {
                toUserId: new mongoose.Types.ObjectId(userId),
                read: false
            }
        },
        {
            $group: {
                _id: {
                    fromUserId: '$fromUserId',
                    jobId: '$jobId'
                },
                unreadCount: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: '_id.fromUserId',
                foreignField: '_id',
                as: 'fromUser'
            }
        }
    ]);
};

// searchMessages: ค้นหาข้อความด้วย keyword
MessageSchema.statics.searchMessages = function (
    userId: string,
    searchTerm: string,
    options: any = {}
) {
    const {
        page = 1,
        limit = 20,
        jobId
    } = options;

    let query: any = {
        $or: [
            { fromUserId: userId },
            { toUserId: userId }
        ],
        message: { $regex: searchTerm, $options: 'i' }
    };

    if (jobId) {
        query.jobId = jobId;
    }

    const skip = (page - 1) * limit;

    return this.find(query)
        .populate('fromUserId', 'name email profilePic')
        .populate('toUserId', 'name email profilePic')
        .populate('jobId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
};

// deleteOldMessages: ลบข้อความเก่าตามจำนวนวัน
MessageSchema.statics.deleteOldMessages = async function (daysOld: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.deleteMany({
        createdAt: { $lt: cutoffDate }
    });

    return result.deletedCount;
};

// getMessageStats: สถิติข้อความ (เช่น จำนวน text/file/image, จำนวนอ่าน/ยังไม่ได้อ่าน)
MessageSchema.statics.getMessageStats = async function (userId?: string) {
    const matchStage = userId ?
        { $match: { $or: [{ fromUserId: new mongoose.Types.ObjectId(userId) }, { toUserId: new mongoose.Types.ObjectId(userId) }] } } :
        { $match: {} };

    const stats = await this.aggregate([
        matchStage,
        {
            $group: {
                _id: '$messageType',
                count: { $sum: 1 }
            }
        }
    ]);

    const readStats = await this.aggregate([
        matchStage,
        {
            $group: {
                _id: '$read',
                count: { $sum: 1 }
            }
        }
    ]);

    return {
        total: await this.countDocuments(userId ?
            { $or: [{ fromUserId: userId }, { toUserId: userId }] } : {}),
        unread: readStats.find(s => s._id === false)?.count || 0,
        read: readStats.find(s => s._id === true)?.count || 0,
        textMessages: stats.find(s => s._id === 'text')?.count || 0,
        fileMessages: stats.find(s => s._id === 'file')?.count || 0,
        imageMessages: stats.find(s => s._id === 'image')?.count || 0
    };
};

// ---------- Virtual Properties ----------

// timeAgo: แสดงเวลาข้อความแบบ human readable (เช่น 2m ago)
MessageSchema.virtual('timeAgo').get(function () {
    const now = new Date();
    const messageTime = new Date(this.createdAt);
    const diffInSeconds = Math.floor((now.getTime() - messageTime.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
});

// isFromMe: ใช้สำหรับ UI ว่าข้อความนี้ส่งโดย user ปัจจุบันหรือไม่ (set จาก API)
MessageSchema.virtual('isFromMe').get(function () {
    return this._isFromMe || false;
});

// ---------- Middleware ----------

// pre-save: ตรวจสอบไฟล์แนบก่อนบันทึก
MessageSchema.pre('save', function (next) {
    // ถ้า messageType ไม่ใช่ text ต้องมี attachment
    if (this.messageType !== 'text' && !this.attachment) {
        return next(new Error('Attachment is required for non-text messages'));
    }

    // ถ้าเป็น text ไม่ควรมี attachment
    if (this.messageType === 'text' && this.attachment) {
        this.attachment = null;
    }

    next();
});

// ---------- Transform Output ----------

// toJSON: แปลง _id เป็น id และลบ __v
MessageSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

// สร้าง model สำหรับข้อความ
const Message = mongoose.model<IMessage>('Message', MessageSchema);

export default Message;