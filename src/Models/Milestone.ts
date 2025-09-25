import mongoose, { Schema, Document, Model } from 'mongoose';
import { IMilestone } from '@/types/index';

// กำหนด type สำหรับ document ของ Milestone ที่รวม instance methods
export type MilestoneDocument = IMilestone & Document & {
  markInProgress(): Promise<void>;      // เปลี่ยนสถานะเป็น in_progress
  markCompleted(): Promise<void>;       // เปลี่ยนสถานะเป็น completed
  markPaid(): Promise<void>;            // เปลี่ยนสถานะเป็น paid
  isOverdue(): boolean;                 // เช็คว่าเกินกำหนดหรือไม่
  getDaysUntilDue(): number | null;     // คืนค่าจำนวนวันจนถึงกำหนด
  canBeCompleted(): boolean;            // เช็คว่าสามารถ complete ได้ไหม
  canBePaid(): boolean;                 // เช็คว่าสามารถ paid ได้ไหม
}

// กำหนด interface สำหรับ static methods ของ model (ถ้ามี)
interface MilestoneModel extends Model<MilestoneDocument> {}

// สร้าง schema ของ Milestone
const MilestoneSchema = new Schema<MilestoneDocument>({
  jobId: {
    type: Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job ID is required']
  },
  title: {
    type: String,
    required: [true, 'Milestone title is required'],
    trim: true,
    minlength: [3, 'Milestone title must be at least 3 characters'],
    maxlength: [200, 'Milestone title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Milestone description cannot exceed 1000 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Milestone amount is required'],
    min: [0.01, 'Milestone amount must be greater than 0']
  },
  dueDate: {
    type: Date,
    validate: {
      validator: function(value: Date) {
        return !value || value > new Date();
      },
      message: 'Due date must be in the future'
    }
  },
  status: {
    type: String,
    enum: {
      values: ['unpaid', 'in_progress', 'completed', 'paid'],
      message: 'Status must be one of: unpaid, in_progress, completed, paid'
    },
    default: 'unpaid'
  },
  completedAt: {
    type: Date,
    default: null
  },
  paidAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,    // เพิ่ม createdAt, updatedAt ให้อัตโนมัติ
  versionKey: false    // ไม่สร้าง __v
});

// ---------- Indexes เพื่อเพิ่มประสิทธิภาพการค้นหา ----------
MilestoneSchema.index({ jobId: 1 });
MilestoneSchema.index({ status: 1 });
MilestoneSchema.index({ dueDate: 1 });
MilestoneSchema.index({ createdAt: -1 });
MilestoneSchema.index({ jobId: 1, status: 1 });      // compound index
MilestoneSchema.index({ status: 1, dueDate: 1 });    // compound index

// ---------- Instance Methods ----------

// เปลี่ยนสถานะเป็น in_progress (ถ้าสถานะปัจจุบันคือ unpaid)
MilestoneSchema.methods.markInProgress = async function(): Promise<void> {
  if (this.status === 'unpaid') {
    this.status = 'in_progress';
    await this.save();
  } else {
    throw new Error('Milestone must be in unpaid status to mark as in progress');
  }
};

// เปลี่ยนสถานะเป็น completed (ถ้าเป็น in_progress หรือ unpaid)
MilestoneSchema.methods.markCompleted = async function(): Promise<void> {
  if (this.status === 'in_progress' || this.status === 'unpaid') {
    this.status = 'completed';
    this.completedAt = new Date();
    await this.save();
  } else {
    throw new Error('Milestone must be in progress or unpaid to mark as completed');
  }
};

// เปลี่ยนสถานะเป็น paid (ถ้าสถานะปัจจุบันคือ completed)
MilestoneSchema.methods.markPaid = async function(): Promise<void> {
  if (this.status === 'completed') {
    this.status = 'paid';
    this.paidAt = new Date();
    await this.save();
  } else {
    throw new Error('Milestone must be completed to mark as paid');
  }
};

// เช็คว่า milestone นี้เกินกำหนดหรือไม่
MilestoneSchema.methods.isOverdue = function(): boolean {
  if (!this.dueDate) return false;
  return new Date() > this.dueDate && this.status !== 'completed' && this.status !== 'paid';
};

// คืนค่าจำนวนวันจนถึงกำหนด (ถ้าไม่มี dueDate คืน null)
MilestoneSchema.methods.getDaysUntilDue = function(): number | null {
  if (!this.dueDate) return null;
  const now = new Date();
  const dueDate = new Date(this.dueDate);
  const diffTime = dueDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// เช็คว่าสามารถ mark completed ได้ไหม
MilestoneSchema.methods.canBeCompleted = function(): boolean {
  return this.status === 'in_progress' || this.status === 'unpaid';
};

// เช็คว่าสามารถ mark paid ได้ไหม
MilestoneSchema.methods.canBePaid = function(): boolean {
  return this.status === 'completed';
};

// ---------- Static Methods ----------

// หาทุก milestone ของ job ที่ระบุ
MilestoneSchema.statics.findByJob = function(jobId: string) {
  return this.find({ jobId }).sort({ createdAt: 1 });
};

// หาทุก milestone ตามสถานะที่ระบุ
MilestoneSchema.statics.findByStatus = function(status: string) {
  return this.find({ status }).sort({ createdAt: -1 });
};

// หาทุก milestone ที่ overdue (เลยกำหนดและยังไม่เสร็จ)
MilestoneSchema.statics.findOverdue = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    status: { $in: ['unpaid', 'in_progress'] }
  }).sort({ dueDate: 1 });
};

// หาทุก milestone ที่จะครบกำหนดในอีก X วัน (default 7 วัน)
MilestoneSchema.statics.findDueSoon = function(days: number = 7) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);
  
  return this.find({
    dueDate: { 
      $gte: new Date(),
      $lte: dueDate 
    },
    status: { $in: ['unpaid', 'in_progress'] }
  }).sort({ dueDate: 1 });
};

// สถิติ milestone (เช่น จำนวน, ยอดเงินรวม, overdue, ฯลฯ)
MilestoneSchema.statics.getMilestoneStats = async function(jobId?: string) {
  const matchStage = jobId ? { $match: { jobId: new mongoose.Types.ObjectId(jobId) } } : { $match: {} };
  
  const stats = await this.aggregate([
    matchStage,
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' }
      }
    }
  ]);

  const overdueCount = await this.countDocuments({
    ...(jobId && { jobId }),
    dueDate: { $lt: new Date() },
    status: { $in: ['unpaid', 'in_progress'] }
  });

  const dueSoonCount = await this.countDocuments({
    ...(jobId && { jobId }),
    dueDate: { 
      $gte: new Date(),
      $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    status: { $in: ['unpaid', 'in_progress'] }
  });

  return {
    total: await this.countDocuments(jobId ? { jobId } : {}),
    unpaid: stats.find(s => s._id === 'unpaid')?.count || 0,
    inProgress: stats.find(s => s._id === 'in_progress')?.count || 0,
    completed: stats.find(s => s._id === 'completed')?.count || 0,
    paid: stats.find(s => s._id === 'paid')?.count || 0,
    overdue: overdueCount,
    dueSoon: dueSoonCount,
    totalAmount: stats.reduce((sum, stat) => sum + (stat.totalAmount || 0), 0),
    paidAmount: stats.find(s => s._id === 'paid')?.totalAmount || 0,
    pendingAmount: stats.filter(s => s._id !== 'paid').reduce((sum, stat) => sum + (stat.totalAmount || 0), 0)
  };
};

// คำนวณยอดเงินรวมของ milestone ทั้งหมดใน job ที่ระบุ
MilestoneSchema.statics.getTotalAmountForJob = async function(jobId: string): Promise<number> {
  const result = await this.aggregate([
    { $match: { jobId: new mongoose.Types.ObjectId(jobId) } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  return result.length > 0 ? result[0].total : 0;
};

// คำนวณเปอร์เซ็นต์ milestone ที่เสร็จใน job ที่ระบุ
MilestoneSchema.statics.getCompletionPercentage = async function(jobId: string): Promise<number> {
  const total = await this.countDocuments({ jobId });
  if (total === 0) return 0;
  
  const completed = await this.countDocuments({ 
    jobId, 
    status: { $in: ['completed', 'paid'] }
  });
  
  return Math.round((completed / total) * 100);
};

// ---------- Virtual Properties ----------

// คืนค่า amount ในรูปแบบ currency (USD)
MilestoneSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(this.amount);
});

// คืนค่าจำนวนวันจนถึงกำหนด (เรียกใช้ method getDaysUntilDue)
MilestoneSchema.virtual('daysUntilDue').get(function (this: MilestoneDocument) {
  return this.getDaysUntilDue();
});

// เปลี่ยนชื่อ virtual property เป็น overdueStatus เพื่อไม่ซ้ำกับ method
MilestoneSchema.virtual('overdueStatus').get(function (this: MilestoneDocument) {
  return this.isOverdue();
});

// คืนค่าสีตามสถานะ (ใช้สำหรับ UI)
MilestoneSchema.virtual('statusColor').get(function() {
  const colors = {
    unpaid: '#f59e0b',
    in_progress: '#3b82f6',
    completed: '#10b981',
    paid: '#059669'
  };
  return colors[this.status] || '#6b7280';
});

// ---------- Middleware ----------

// pre-save: ตั้ง completedAt/padAt อัตโนมัติเมื่อสถานะเปลี่ยน
MilestoneSchema.pre('save', function(next) {
  // ถ้าเปลี่ยนสถานะเป็น completed และยังไม่มี completedAt ให้เซ็ตวันที่
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  // ถ้าเปลี่ยนสถานะเป็น paid และยังไม่มี paidAt ให้เซ็ตวันที่
  if (this.isModified('status') && this.status === 'paid' && !this.paidAt) {
    this.paidAt = new Date();
  }
  next();
});

// ---------- Transform Output ----------

// กำหนดให้ toJSON แปลง _id เป็น id และลบ __v
MilestoneSchema.set('toJSON', {
  virtuals: true,
  transform: function(_, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// ---------- Model Creation ----------

// สร้าง model Milestone ด้วย schema และ type ที่กำหนด
const Milestone = mongoose.model<MilestoneDocument, MilestoneModel>('Milestone', MilestoneSchema);

export default Milestone;