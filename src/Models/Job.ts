import mongoose, { Schema, model, Document } from 'mongoose';
import { IJob } from '@/types/typese';

// สร้าง type สำหรับ document ของ Job ที่รวม instance methods และ virtual properties
export type JobDocument = IJob & Document & {
  addApplicant(userId: string): boolean; // เพิ่มผู้สมัคร
  removeApplicant(userId: string): boolean; // ลบผู้สมัคร
  assignWorker(workerId: string): Promise<void>; // มอบหมายงานให้ worker
  completeJob(): Promise<void>; // ทำเครื่องหมายว่างานเสร็จ
  cancelJob(): Promise<void>; // ยกเลิกงาน
  closeJob(): Promise<void>; // ปิดงาน
  canUserApply(userId: string): boolean; // เช็คว่าผู้ใช้สมัครงานนี้ได้ไหม
  isEditable(): boolean; // เช็คว่างานนี้แก้ไขได้ไหม
  addMilestone(milestoneId: string): void; // เพิ่ม milestone ให้กับงาน
  // Virtual properties
  applicationCount: number; // จำนวนผู้สมัคร
  daysUntilDeadline: number | null; // จำนวนวันจนถึง deadline
  formattedBudget: string; // งบประมาณในรูปแบบ currency
};

// สร้าง interface สำหรับ static methods ของ model
interface JobModel extends mongoose.Model<JobDocument> {
  findByEmployer(employerId: string): mongoose.Query<JobDocument[], JobDocument>; // หางานทั้งหมดของ employer
  findByWorker(workerId: string): mongoose.Query<JobDocument[], JobDocument>; // หางานทั้งหมดของ worker
  findActiveJobs(): mongoose.Query<JobDocument[], JobDocument>; // หางานที่เปิดรับสมัคร
  findByCategory(category: string): mongoose.Query<JobDocument[], JobDocument>; // หางานตามหมวดหมู่
  findByType(type: string): mongoose.Query<JobDocument[], JobDocument>; // หางานตามประเภท
  searchJobs(searchTerm: string): mongoose.Query<JobDocument[], JobDocument>; // ค้นหางานด้วยข้อความ
  getJobStats(): Promise<{
    total: number;
    active: number;
    completed: number;
    inProgress: number;
    cancelled: number;
    statusBreakdown: Array<{
      _id: string;
      count: number;
      totalBudget: number;
      avgBudget: number;
    }>;
    typeBreakdown: Array<{
      _id: string;
      count: number;
    }>;
    topCategories: Array<{
      _id: string;
      count: number;
    }>;
  }>;
  findWithFilters(filters: any, options?: any): mongoose.Query<JobDocument[], JobDocument>; // ค้นหางานด้วยตัวกรอง
}

// สร้าง schema ของ Job
const JobSchema = new Schema<JobDocument>({
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    minlength: [5, 'Job title must be at least 5 characters'],
    maxlength: [200, 'Job title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    trim: true,
    minlength: [20, 'Job description must be at least 20 characters'],
    maxlength: [5000, 'Job description cannot exceed 5000 characters']
  },
  type: {
    type: String,
    enum: {
      values: ['freelance', 'part-time', 'contract', 'full-time'],
      message: 'Job type must be one of: freelance, part-time, contract, full-time'
    },
    required: [true, 'Job type is required']
  },
  category: {
    type: String,
    required: [true, 'Job category is required'],
    trim: true,
    maxlength: [100, 'Category cannot exceed 100 characters']
  },
  budget: {
    type: Number,
    required: [true, 'Budget is required'],
    min: [1, 'Budget must be at least $1']
  },
  duration: {
    type: String,
    required: [true, 'Duration is required'],
    trim: true,
    maxlength: [100, 'Duration cannot exceed 100 characters']
  },
  deadline: {
    type: Date,
    validate: {
      validator: function (this: JobDocument, value: Date) {
        return !value || value > new Date();
      },
      message: 'Deadline must be in the future'
    }
  },
  employerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employer ID is required']
  },
  workerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'closed', 'in_progress', 'completed', 'cancelled'],
      message: 'Status must be one of: active, closed, in_progress, completed, cancelled'
    },
    default: 'active'
  },
  requirements: [{
    type: String,
    trim: true,
    maxlength: [500, 'Each requirement cannot exceed 500 characters']
  }],
  attachments: [{
    type: String,
    trim: true
  }],
  applicants: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  milestones: [{
    type: Schema.Types.ObjectId,
    ref: 'Milestone'
  }]
}, {
  timestamps: true, // เพิ่ม createdAt, updatedAt ให้อัตโนมัติ
  versionKey: false // ไม่สร้าง __v
});

// สร้าง index เพื่อเพิ่มประสิทธิภาพการค้นหา
JobSchema.index({ employerId: 1 });
JobSchema.index({ workerId: 1 });
JobSchema.index({ category: 1 });
JobSchema.index({ type: 1 });
JobSchema.index({ status: 1 });
JobSchema.index({ budget: 1 });
JobSchema.index({ createdAt: -1 });
JobSchema.index({ deadline: 1 });
JobSchema.index({ title: 'text', description: 'text' }); // สำหรับ full-text search

// สร้าง compound index
JobSchema.index({ status: 1, type: 1 });
JobSchema.index({ category: 1, status: 1 });
JobSchema.index({ employerId: 1, status: 1 });

// ------------------- Instance Methods -------------------

// เพิ่มผู้สมัครในงาน ถ้ายังไม่มี userId นี้ใน applicants
JobSchema.methods.addApplicant = function (this: JobDocument, userId: string): boolean {
  try {
    if (!this.applicants) {
      this.applicants = [];
    }
    if (!this.applicants.some((id: any) => id.toString() === userId)) {
      this.applicants.push(userId as any);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error adding applicant:', error);
    return false;
  }
};

// ลบผู้สมัครออกจากงาน
JobSchema.methods.removeApplicant = function (this: JobDocument, userId: string): boolean {
  try {
    if (!this.applicants) {
      this.applicants = [];
      return false;
    }
    const index = this.applicants.findIndex((id: any) => id.toString() === userId);
    if (index > -1) {
      this.applicants.splice(index, 1);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error removing applicant:', error);
    return false;
  }
};

// มอบหมาย worker ให้กับงาน และเปลี่ยนสถานะเป็น in_progress
JobSchema.methods.assignWorker = async function (this: JobDocument, workerId: string): Promise<void> {
  try {
    this.workerId = workerId as any;
    this.status = 'in_progress';
    await this.save();
  } catch (error) {
    console.error('Error assigning worker:', error);
    throw new Error('Failed to assign worker');
  }
};

// ทำเครื่องหมายว่างานเสร็จ (ต้องอยู่ในสถานะ in_progress)
JobSchema.methods.completeJob = async function (this: JobDocument): Promise<void> {
  try {
    if (this.status !== 'in_progress') {
      throw new Error('Job must be in progress to complete');
    }
    this.status = 'completed';
    await this.save();
  } catch (error) {
    console.error('Error completing job:', error);
    throw error;
  }
};

// ยกเลิกงาน (ห้ามยกเลิกถ้าเป็น completed หรือ cancelled)
JobSchema.methods.cancelJob = async function (this: JobDocument): Promise<void> {
  try {
    if (['completed', 'cancelled'].includes(this.status)) {
      throw new Error('Cannot cancel completed or already cancelled job');
    }
    this.status = 'cancelled';
    await this.save();
  } catch (error) {
    console.error('Error cancelling job:', error);
    throw error;
  }
};

// ปิดงาน (ห้ามปิดถ้าอยู่ในสถานะ in_progress)
JobSchema.methods.closeJob = async function (this: JobDocument): Promise<void> {
  try {
    if (this.status === 'in_progress') {
      throw new Error('Cannot close job that is in progress');
    }
    this.status = 'closed';
    await this.save();
  } catch (error) {
    console.error('Error closing job:', error);
    throw error;
  }
};

// เช็คว่าผู้ใช้สามารถสมัครงานนี้ได้หรือไม่
JobSchema.methods.canUserApply = function (this: JobDocument, userId: string): boolean {
  try {
    if (!userId || !this.employerId) return false;
    return this.status === 'active' &&
      (!this.applicants || !this.applicants.some((id: any) => id.toString() === userId)) &&
      this.employerId.toString() !== userId;
  } catch (error) {
    console.error('Error checking if user can apply:', error);
    return false;
  }
};

// เช็คว่างานนี้สามารถแก้ไขได้หรือไม่ (เฉพาะสถานะ active หรือ closed)
JobSchema.methods.isEditable = function (this: JobDocument): boolean {
  return ['active', 'closed'].includes(this.status);
};

// เพิ่ม milestone ให้กับงาน
JobSchema.methods.addMilestone = function (this: JobDocument, milestoneId: string): void {
  try {
    if (!this.milestones) {
      this.milestones = [];
    }
    if (!this.milestones.some((id: any) => id.toString() === milestoneId)) {
      this.milestones.push(milestoneId as any);
    }
  } catch (error) {
    console.error('Error adding milestone:', error);
  }
};

// ------------------- Static Methods -------------------

// หางานทั้งหมดของ employer ที่ระบุ
JobSchema.statics.findByEmployer = function (employerId: string) {
  return this.find({ employerId }).sort({ createdAt: -1 });
};

// หางานทั้งหมดที่ worker รับผิดชอบ
JobSchema.statics.findByWorker = function (workerId: string) {
  return this.find({ workerId }).sort({ createdAt: -1 });
};

// หางานที่เปิดรับสมัครอยู่
JobSchema.statics.findActiveJobs = function () {
  return this.find({ status: 'active' }).sort({ createdAt: -1 });
};

// หางานตามหมวดหมู่
JobSchema.statics.findByCategory = function (category: string) {
  return this.find({
    category: new RegExp(category, 'i'),
    status: 'active'
  }).sort({ createdAt: -1 });
};

// หางานตามประเภท
JobSchema.statics.findByType = function (type: string) {
  return this.find({ type, status: 'active' }).sort({ createdAt: -1 });
};

// ค้นหางานด้วยข้อความ (full-text search)
JobSchema.statics.searchJobs = function (searchTerm: string) {
  return this.find({
    $text: { $search: searchTerm },
    status: 'active'
  }).sort({ score: { $meta: 'textScore' }, createdAt: -1 });
};

// ดึงสถิติงาน เช่น จำนวนงานแต่ละสถานะ, งบประมาณรวม, หมวดหมู่ยอดนิยม ฯลฯ
JobSchema.statics.getJobStats = async function () {
  try {
    const stats = await this.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalBudget: { $sum: '$budget' },
          avgBudget: { $avg: '$budget' }
        }
      }
    ]);

    const typeStats = await this.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const categoryStats = await this.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    return {
      total: await this.countDocuments(),
      active: await this.countDocuments({ status: 'active' }),
      completed: await this.countDocuments({ status: 'completed' }),
      inProgress: await this.countDocuments({ status: 'in_progress' }),
      cancelled: await this.countDocuments({ status: 'cancelled' }),
      statusBreakdown: stats,
      typeBreakdown: typeStats,
      topCategories: categoryStats
    };
  } catch (error) {
    console.error('Error getting job stats:', error);
    throw new Error('Failed to get job statistics');
  }
};

// ค้นหางานด้วยตัวกรองต่าง ๆ เช่น คำค้นหา, หมวดหมู่, ประเภท, งบประมาณ, สถานะ, การแบ่งหน้า
JobSchema.statics.findWithFilters = function (filters: any, options: any = {}) {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      search,
      category,
      type,
      minBudget,
      maxBudget,
      status = 'active'
    } = options;

    let query: any = { ...filters };

    // กรองสถานะ
    if (status) query.status = status;

    // กรองด้วยข้อความค้นหา
    if (search) {
      query.$text = { $search: search };
    }

    // กรองหมวดหมู่
    if (category) {
      query.category = new RegExp(category, 'i');
    }

    // กรองประเภท
    if (type) {
      query.type = type;
    }

    // กรองช่วงงบประมาณ
    if (minBudget || maxBudget) {
      query.budget = {};
      if (minBudget) query.budget.$gte = minBudget;
      if (maxBudget) query.budget.$lte = maxBudget;
    }

    const skip = (page - 1) * limit;

    return this.find(query)
      .populate('employerId', 'name email profilePic')
      .populate('workerId', 'name email profilePic')
      .sort(sort)
      .skip(skip)
      .limit(limit);
  } catch (error) {
    console.error('Error finding jobs with filters:', error);
    return this.find({});
  }
};

// ------------------- Virtual Properties -------------------

// จำนวนผู้สมัครในงานนี้
JobSchema.virtual('applicationCount').get(function (this: JobDocument) {
  return this.applicants?.length || 0;
});

// จำนวนวันจนถึง deadline (ถ้าไม่มี deadline คืนค่า null)
JobSchema.virtual('daysUntilDeadline').get(function (this: JobDocument) {
  if (!this.deadline) return null;
  try {
    const now = new Date();
    const deadline = new Date(this.deadline);
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (error) {
    console.error('Error calculating days until deadline:', error);
    return null;
  }
});

// งบประมาณในรูปแบบ currency (USD)
JobSchema.virtual('formattedBudget').get(function (this: JobDocument) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(this.budget);
  } catch (error) {
    console.error('Error formatting budget:', error);
    return `$${this.budget}`;
  }
});

// ------------------- Middleware -------------------

// pre-save: ปิดงานอัตโนมัติถ้า deadline หมด, ตรวจสอบและ initialize array ต่าง ๆ
JobSchema.pre('save', function (this: JobDocument, next) {
  try {
    // Auto-close expired jobs
    if (this.deadline && new Date() > this.deadline && this.status === 'active') {
      this.status = 'closed';
    }
    // กำหนดค่า default ให้ array ถ้ายังไม่มี
    if (!this.applicants) this.applicants = [];
    if (!this.milestones) this.milestones = [];
    if (!this.requirements) this.requirements = [];
    if (!this.attachments) this.attachments = [];
    next();
  } catch (error) {
    next(error as Error);
  }
});

// post-save: log ข้อมูลหลังบันทึกงาน
JobSchema.post('save', function (this: JobDocument) {
  console.log(`Job ${this._id} was saved with status: ${this.status}`);
});

// pre-remove: log ข้อมูลก่อนลบงาน
JobSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  try {
    console.log(`Job ${this._id} is being deleted`);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// ------------------- Transform Output -------------------

// กำหนดให้ toJSON และ toObject แปลง _id เป็น id และลบฟิลด์ที่ไม่จำเป็นออก
JobSchema.set('toJSON', {
  virtuals: true,
  transform: function (_: any, ret: any) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

JobSchema.set('toObject', {
  virtuals: true,
  transform: function (_: any, ret: any) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// ------------------- Model Creation -------------------

// สร้าง model Job ด้วย schema และ type ที่กำหนด
const Job = mongoose.model<JobDocument, JobModel>('Job', JobSchema);

export default Job;