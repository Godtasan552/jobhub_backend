import mongoose, { Schema, Types ,Document } from 'mongoose';
import { ITransaction } from '@/types/index';

// ================================
// Define the Transaction Schema
// ================================
const TransactionSchema = new Schema<ITransaction>({
    // ประเภทของธุรกรรม
    type: {
        type: String,
        enum: {
            values: ['job_payment', 'milestone_payment', 'payroll', 'refund', 'bonus'], // กำหนดค่าได้เฉพาะ 5 type
            message: 'Type must be one of: job_payment, milestone_payment, payroll, refund, bonus'
        },
        required: [true, 'Transaction type is required'] // field นี้จำเป็นต้องมี
    },
    // อ้างอิงงานที่เกี่ยวข้อง
    jobId: {
        type: Schema.Types.ObjectId,
        ref: 'Job', // อ้างอิง collection Job
        default: null
    },
    milestoneId: {
        type: Schema.Types.ObjectId,
        ref: 'Milestone',
        default: null
    },
    payrollId: {
        type: Schema.Types.ObjectId,
        ref: 'Payroll',
        default: null
    },
    // ผู้ส่งเงิน
    from: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'From user is required']
    },
    // ผู้รับเงิน
    to: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'To user is required']
    },
    // จำนวนเงิน
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0.01, 'Amount must be greater than 0'] // ต้องมากกว่า 0
    },
    // สถานะของธุรกรรม
    status: {
        type: String,
        enum: {
            values: ['pending', 'completed', 'failed', 'cancelled'], // ค่าได้จำกัด
            message: 'Status must be one of: pending, completed, failed, cancelled'
        },
        default: 'pending'
    },
    // รายละเอียดเพิ่มเติม
    description: {
        type: String,
        trim: true, // ตัดช่องว่างหน้า/หลัง
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    // รหัสอ้างอิงธุรกรรม
    reference: {
        type: String,
        trim: true,
        maxlength: [100, 'Reference cannot exceed 100 characters']
    }
}, {
    timestamps: true, // สร้าง createdAt / updatedAt อัตโนมัติ
    versionKey: false // ปิด __v
});

// ================================
// Indexes for performance
// ================================
TransactionSchema.index({ from: 1 });
TransactionSchema.index({ to: 1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ jobId: 1 });
TransactionSchema.index({ milestoneId: 1 });

// Compound indexes (ช่วย query แบบหลายเงื่อนไขเร็วขึ้น)
TransactionSchema.index({ from: 1, status: 1 });
TransactionSchema.index({ to: 1, status: 1 });
TransactionSchema.index({ type: 1, status: 1 });

// ================================
// Instance methods (สำหรับแต่ละ transaction)
// ================================

// เปลี่ยนสถานะเป็น completed
TransactionSchema.methods.complete = async function (): Promise<void> {
    if (this.status !== 'pending') {
        throw new Error('Transaction must be pending to complete');
    }
    this.status = 'completed';
    await this.save();
};

// เปลี่ยนสถานะเป็น failed พร้อมบันทึกเหตุผล
TransactionSchema.methods.fail = async function (reason?: string): Promise<void> {
    if (this.status !== 'pending') {
        throw new Error('Transaction must be pending to fail');
    }
    this.status = 'failed';
    if (reason) {
        this.description = this.description ? `${this.description} - Failed: ${reason}` : `Failed: ${reason}`;
    }
    await this.save();
};

// ยกเลิก transaction
TransactionSchema.methods.cancel = async function (): Promise<void> {
    if (this.status !== 'pending') {
        throw new Error('Transaction must be pending to cancel');
    }
    this.status = 'cancelled';
    await this.save();
};

// ตรวจสอบว่าสามารถประมวลผล transaction ได้หรือไม่
TransactionSchema.methods.canBeProcessed = function (): boolean {
    return this.status === 'pending';
};

// สร้างรหัสอ้างอิงแบบสุ่ม
TransactionSchema.methods.generateReference = function (): string {
  return `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

// ================================
// Static methods (เรียกจาก model โดยตรง)
// ================================

// หาธุรกรรมที่เกี่ยวข้องกับ user ทั้งส่งและรับ
TransactionSchema.statics.findByUser = function (userId: string, options: any = {}) {
    const { page = 1, limit = 10, status, type, sort = '-createdAt' } = options;

    let query: any = { $or: [ { from: userId }, { to: userId } ] };
    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (page - 1) * limit;

    return this.find(query)
        .populate('from', 'name email profilePic')
        .populate('to', 'name email profilePic')
        .populate('jobId', 'title')
        .populate('milestoneId', 'title')
        .sort(sort)
        .skip(skip)
        .limit(limit);
};

// หาธุรกรรมที่ส่งโดย user
TransactionSchema.statics.findSentByUser = function (userId: string, options: any = {}) {
    const { page = 1, limit = 10, status, type, sort = '-createdAt' } = options;

    let query: any = { from: userId };
    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (page - 1) * limit;

    return this.find(query)
        .populate('to', 'name email profilePic')
        .populate('jobId', 'title')
        .populate('milestoneId', 'title')
        .sort(sort)
        .skip(skip)
        .limit(limit);
};

// หาธุรกรรมที่รับโดย user
TransactionSchema.statics.findReceivedByUser = function (userId: string, options: any = {}) {
    const { page = 1, limit = 10, status, type, sort = '-createdAt' } = options;

    let query: any = { to: userId };
    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (page - 1) * limit;

    return this.find(query)
        .populate('from', 'name email profilePic')
        .populate('jobId', 'title')
        .populate('milestoneId', 'title')
        .sort(sort)
        .skip(skip)
        .limit(limit);
};

// หาธุรกรรมตามงาน
TransactionSchema.statics.findByJob = function (jobId: string) {
    return this.find({ jobId })
        .populate('from', 'name email')
        .populate('to', 'name email')
        .sort({ createdAt: -1 });
};

// หาธุรกรรมที่ยัง pending
TransactionSchema.statics.findPending = function () {
    return this.find({ status: 'pending' })
        .populate('from', 'name email')
        .populate('to', 'name email')
        .sort({ createdAt: 1 });
};

// คำนวณ balance ของ user
TransactionSchema.statics.getUserBalance = async function (userId: string): Promise<number> {
    // รวมยอดรับ
    const received = await this.aggregate([
        { $match: { to: new mongoose.Types.ObjectId(userId), status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // รวมยอดส่ง
    const sent = await this.aggregate([
        { $match: { from: new mongoose.Types.ObjectId(userId), status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalReceived = received.length > 0 ? received[0].total : 0;
    const totalSent = sent.length > 0 ? sent[0].total : 0;

    return totalReceived - totalSent;
};

// สถิติธุรกรรม
TransactionSchema.statics.getTransactionStats = async function (userId?: string) {
    const matchStage = userId ?
        { $match: { $or: [{ from: new mongoose.Types.ObjectId(userId) }, { to: new mongoose.Types.ObjectId(userId) }] } } :
        { $match: {} };

    // สถิติตาม status
    const stats = await this.aggregate([
        matchStage,
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$amount' }
            }
        }
    ]);

    // สถิติตาม type
    const typeStats = await this.aggregate([
        matchStage,
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
                totalAmount: { $sum: '$amount' }
            }
        }
    ]);

    return {
        total: await this.countDocuments(userId ?
            { $or: [{ from: userId }, { to: userId }] } : {}),
        pending: stats.find(s => s._id === 'pending')?.count || 0,
        completed: stats.find(s => s._id === 'completed')?.count || 0,
        failed: stats.find(s => s._id === 'failed')?.count || 0,
        cancelled: stats.find(s => s._id === 'cancelled')?.count || 0,
        totalVolume: stats.reduce((sum, stat) => sum + (stat.totalAmount || 0), 0),
        completedVolume: stats.find(s => s._id === 'completed')?.totalAmount || 0,
        typeBreakdown: typeStats
    };
};

// สร้างธุรกรรม Job Payment
TransactionSchema.statics.createJobPayment = async function (
    fromUserId: string,
    toUserId: string,
    jobId: string,
    amount: number,
    description?: string
) {
    const transaction = new this({
        type: 'job_payment',
        jobId,
        from: fromUserId,
        to: toUserId,
        amount,
        description,
        reference: null
    });

    transaction.reference = transaction.generateReference(); // สร้างรหัสอ้างอิง
    return await transaction.save();
};

// สร้างธุรกรรม Milestone Payment
TransactionSchema.statics.createMilestonePayment = async function (
    fromUserId: string,
    toUserId: string,
    milestoneId: string,
    amount: number,
    description?: string
) {
    const transaction = new this({
        type: 'milestone_payment',
        milestoneId,
        from: fromUserId,
        to: toUserId,
        amount,
        description,
        reference: null
    });

    transaction.reference = transaction.generateReference();
    return await transaction.save();
};

// ================================
// Virtual fields (ไม่เก็บใน DB)
// ================================

// แสดงจำนวนเงินเป็น format สกุลเงิน
TransactionSchema.virtual('formattedAmount').get(function () {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(this.amount);
});

// แสดงทิศทางธุรกรรมสำหรับ user เฉพาะ
TransactionSchema.virtual('direction').get(function (this: any) {
  return this._direction || 'unknown';
});

// แสดงสีตามสถานะ
TransactionSchema.virtual('statusColor').get(function () {
    const colors = {
        pending: '#f59e0b',
        completed: '#10b981',
        failed: '#ef4444',
        cancelled: '#6b7280'
    };
    return colors[this.status] || '#6b7280';
});

// ================================
// Middleware
// ================================

// ก่อน save, สร้าง reference ถ้ายังไม่มี
TransactionSchema.pre('save', function (next) {
    if (!this.reference) {
        this.reference = this.generateReference();
    }
    next();
});

// Transform JSON output
TransactionSchema.set('toJSON', {
    virtuals: true, // เอา virtual ด้วย
    transform: function (_doc, ret) {
        ret.id = ret._id; // เปลี่ยน _id เป็น id
        delete ret._id;
        delete ret.__v; // ลบ version
        return ret;
    }
});

// ================================
// Export model
// ================================
const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;
