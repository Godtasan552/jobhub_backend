import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { IUser } from '@/types/index';

// สร้าง Mongoose Schema สำหรับ User
const UserSchema = new Schema<IUser>({
  // ข้อมูลชื่อผู้ใช้
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },

  // ข้อมูลอีเมลผู้ใช้
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },

  // รหัสผ่านแบบ hash
  passwordHash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },

  // กระเป๋าเงินผู้ใช้
  wallet: {
    type: Number,
    default: 0,
    min: [0, 'Wallet balance cannot be negative']
  },

  // ระบุบทบาทผู้ใช้ - เปลี่ยนเป็น array
  role: [{
    type: String,
    enum: ['employer', 'worker', 'admin'],
    required: true
  }],

  // Skills ของผู้ใช้
  skills: [{
    type: String,
    trim: true
  }],

  // Categories ของผู้ใช้
  categories: [{
    type: String,
    trim: true
  }],

  // รูปโปรไฟล์
  profilePic: {
    type: String,
    default: null
  },

  // เกี่ยวกับตัวผู้ใช้
  about: {
    type: String,
    maxlength: [1000, 'About section cannot exceed 1000 characters'],
    trim: true
  },

  // เบอร์โทรศัพท์
  phone: {
    type: String,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number'],
    trim: true
  },

  // ที่อยู่หรือ location
  location: {
    type: String,
    maxlength: [200, 'Location cannot exceed 200 characters'],
    trim: true
  },

  // สถานะผู้ใช้
  isActive: {
    type: Boolean,
    default: true
  },

  // เวลาที่ login ล่าสุด
  lastLoginAt: {
    type: Date,
    default: null
  },

  // Worker approval fields
  isWorkerApproved: {
    type: Boolean,
    default: false
  },

  workerApprovedAt: {
    type: Date,
    default: null
  },

  workerApprovedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  workerRejectionReason: {
    type: String,
    trim: true,
    default: null
  },

  workerApplicationDate: {
    type: Date,
    default: null
  },

  // Admin fields
  adminLevel: {
    type: String,
    enum: ['super', 'moderator'],
    default: null
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  lastAdminAction: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes เพื่อเพิ่มประสิทธิภาพการค้นหา
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ skills: 1 });
UserSchema.index({ categories: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ role: 1, isWorkerApproved: 1 }); // สำหรับ admin query
UserSchema.index({ isWorkerApproved: 1, workerApplicationDate: -1 }); // สำหรับ pending workers

// Middleware ก่อน save: hash password
UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();

  try {
    const saltRounds = 12;
    this.passwordHash = await bcrypt.hash(this.passwordHash, saltRounds);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// ==================== ORIGINAL METHODS ====================

// ตรวจสอบ password ที่ผู้ใช้กรอก
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// อัปเดต last login
UserSchema.methods.updateLastLogin = async function (): Promise<void> {
  this.lastLoginAt = new Date();
  await this.save();
};

// เพิ่มหรือลด wallet
UserSchema.methods.updateWallet = async function (amount: number, operation: 'add' | 'subtract' = 'add'): Promise<void> {
  if (operation === 'add') {
    this.wallet += amount;
  } else {
    if (this.wallet >= amount) {
      this.wallet -= amount;
    } else {
      throw new Error('Insufficient wallet balance');
    }
  }
  await this.save();
};

// Public profile (ข้อมูลที่แสดงให้คนอื่นดู)
UserSchema.methods.getPublicProfile = function (): object {
  const publicData = this.toJSON();
  delete publicData.email;
  delete publicData.phone;
  delete publicData.wallet;
  delete publicData.lastLoginAt;
  return publicData;
};

// ==================== NEW ROLE METHODS ====================

// ตรวจสอบว่ามี role นี้หรือไม่
UserSchema.methods.hasRole = function (roleType: 'employer' | 'worker' | 'admin'): boolean {
  return this.role.includes(roleType);
};

// ตรวจสอบว่าเป็น employer หรือไม่
UserSchema.methods.isEmployer = function (): boolean {
  return this.hasRole('employer');
};

// ตรวจสอบว่าเป็น worker หรือไม่
UserSchema.methods.isWorker = function (): boolean {
  return this.hasRole('worker');
};

// ตรวจสอบว่าเป็น admin หรือไม่
UserSchema.methods.isAdmin = function (): boolean {
  return this.hasRole('admin');
};

// ตรวจสอบว่าเป็น super admin หรือไม่
UserSchema.methods.isSuperAdmin = function (): boolean {
  return this.isAdmin() && this.adminLevel === 'super';
};

// เพิ่ม role
UserSchema.methods.addRole = function (roleType: 'employer' | 'worker' | 'admin'): void {
  if (!this.hasRole(roleType)) {
    this.role.push(roleType);
  }
};

// ลบ role
UserSchema.methods.removeRole = function (roleType: 'employer' | 'worker' | 'admin'): void {
  this.role = this.role.filter((r: string) => r !== roleType);
};

// ==================== WORKER SPECIFIC METHODS ====================

// ตรวจสอบว่า worker ได้รับการอนุมัติแล้วหรือไม่
UserSchema.methods.checkWorkerApproved = function (): boolean {
  return this.hasRole('worker') && this.isWorkerApproved === true;
};

// สามารถรับงานได้หรือไม่
UserSchema.methods.canAcceptJobs = function (): boolean {
  return this.checkWorkerApproved() && this.isActive;
};

// สามารถสมัครงานได้หรือไม่
UserSchema.methods.canApplyForJobs = function (): boolean {
  return this.canAcceptJobs();
};

// ==================== ADMIN SPECIFIC METHODS ====================

// สามารถสร้าง admin ได้หรือไม่
UserSchema.methods.canCreateAdmin = function (): boolean {
  return this.isSuperAdmin();
};

// สามารถจัดการผู้ใช้ได้หรือไม่
UserSchema.methods.canManageUsers = function (): boolean {
  return this.isAdmin();
};

// สามารถอนุมัติ worker ได้หรือไม่
UserSchema.methods.canApproveWorkers = function (): boolean {
  return this.isAdmin();
};

// ==================== UTILITY METHODS ====================

// เพิ่ม skill
UserSchema.methods.addSkill = function (skill: string): void {
  if (!this.skills.includes(skill)) {
    this.skills.push(skill);
  }
};

// ลบ skill
UserSchema.methods.removeSkill = function (skill: string): void {
  this.skills = this.skills.filter((s: string) => s !== skill);
};

// เพิ่ม category
UserSchema.methods.addCategory = function (category: string): void {
  if (!this.categories.includes(category)) {
    this.categories.push(category);
  }
};

// ลบ category
UserSchema.methods.removeCategory = function (category: string): void {
  this.categories = this.categories.filter((c: string) => c !== category);
};

// ==================== STATIC METHODS ====================

// ค้นหาผู้ใช้ด้วย email
UserSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

// ค้นหาผู้ใช้ที่ active
UserSchema.statics.findActiveUsers = function () {
  return this.find({ isActive: true });
};

// ค้นหาผู้ใช้ตาม role
UserSchema.statics.findByRole = function (role: 'employer' | 'worker' | 'admin') {
  return this.find({ role: role, isActive: true });
};

// ค้นหาผู้ใช้ตาม skills
UserSchema.statics.findBySkills = function (skills: string[]) {
  return this.find({
    skills: { $in: skills },
    role: 'worker',
    isActive: true
  });
};

// ค้นหาผู้ใช้ตาม categories
UserSchema.statics.findByCategories = function (categories: string[]) {
  return this.find({
    categories: { $in: categories },
    role: 'worker',
    isActive: true
  });
};

// ค้นหา worker ที่รออนุมัติ
UserSchema.statics.findPendingWorkers = function () {
  return this.find({
    role: 'worker',
    isWorkerApproved: false,
    isActive: true
  }).sort({ workerApplicationDate: -1 });
};

// ค้นหา worker ที่อนุมัติแล้ว
UserSchema.statics.findApprovedWorkers = function () {
  return this.find({
    role: 'worker',
    isWorkerApproved: true,
    isActive: true
  }).sort({ workerApprovedAt: -1 });
};

// สถิติผู้ใช้
UserSchema.statics.getUserStats = async function () {
  const stats = await this.aggregate([
    {
      $facet: {
        roleStats: [
          { $unwind: '$role' },
          {
            $group: {
              _id: '$role',
              count: { $sum: 1 },
              activeCount: {
                $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
              }
            }
          }
        ],
        workerStats: [
          { $match: { role: 'worker' } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              approved: {
                $sum: { $cond: [{ $eq: ['$isWorkerApproved', true] }, 1, 0] }
              },
              pending: {
                $sum: { $cond: [{ $eq: ['$isWorkerApproved', false] }, 1, 0] }
              }
            }
          }
        ],
        totalStats: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
              }
            }
          }
        ]
      }
    }
  ]);

  const roleStats = stats[0].roleStats || [];
  const workerStats = stats[0].workerStats[0] || { approved: 0, pending: 0 };
  const totalStats = stats[0].totalStats[0] || { total: 0, active: 0 };

  return {
    total: totalStats.total,
    active: totalStats.active,
    employers: roleStats.find((s: { _id: string; count: number; activeCount: number }) => s._id === 'employer')?.count || 0,
    workers: roleStats.find((s: { _id: string; count: number; activeCount: number }) => s._id === 'worker')?.count || 0,
    admins: roleStats.find((s: { _id: string; count: number; activeCount: number }) => s._id === 'admin')?.count || 0,
    activeEmployers: roleStats.find((s: { _id: string; count: number; activeCount: number }) => s._id === 'employer')?.activeCount || 0,
    activeWorkers: roleStats.find((s: { _id: string; count: number; activeCount: number }) => s._id === 'worker')?.activeCount || 0,
    activeAdmins: roleStats.find((s: { _id: string; count: number; activeCount: number }) => s._id === 'admin')?.activeCount || 0,
    approvedWorkers: workerStats.approved,
    pendingWorkers: workerStats.pending
  };

};

// ==================== VIRTUALS ====================

// Virtual: display name
UserSchema.virtual('displayName').get(function () {
  return this.name || this.email.split('@')[0];
});

// Virtual: คำนวณ profile completion %
UserSchema.virtual('profileCompletion').get(function () {
  let completion = 0;
  const fields = ['name', 'email', 'about', 'phone', 'location', 'profilePic'];
  const skillsWeight = this.skills.length > 0 ? 1 : 0;
  const categoriesWeight = this.categories.length > 0 ? 1 : 0;

  fields.forEach(field => {
    if ((this as any)[field]) completion += 1;
  });

  completion += skillsWeight + categoriesWeight;
  return Math.round((completion / (fields.length + 2)) * 100);
});

// Virtual: worker status
UserSchema.virtual('workerStatus').get(function () {
  if (!this.hasRole('worker')) return 'not_applied';
  if (this.isWorkerApproved) return 'approved';
  if (this.workerRejectionReason) return 'rejected';
  return 'pending';
});

// ==================== TRANSFORM OUTPUT ====================

// Transform output สำหรับ JSON
UserSchema.set('toJSON', {
  transform: function (_doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

// Transform output สำหรับ Object
UserSchema.set('toObject', {
  transform: function (_doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

// ==================== VALIDATION ====================

// Custom validation: ต้องมี role อย่างน้อย 1 อัน
UserSchema.path('role').validate(function (value: string[]) {
  return value && value.length > 0;
}, 'User must have at least one role');

// Custom validation: ถ้าเป็น admin ต้องมี adminLevel
UserSchema.pre('save', function (next) {
  if (this.hasRole('admin') && !this.adminLevel) {
    this.adminLevel = 'moderator'; // default admin level
  }

  // ถ้าไม่ใช่ admin ลบ adminLevel
  if (!this.hasRole('admin')) {
    this.adminLevel = undefined;
  }

  next();
});

// Custom validation: ถ้าสมัครเป็น worker ให้ set workerApplicationDate
UserSchema.pre('save', function (next) {
  // ถ้าเพิ่ง add role worker และยังไม่มี workerApplicationDate
  if (this.hasRole('worker') && !this.workerApplicationDate && this.isNew) {
    this.workerApplicationDate = new Date();
  }

  next();
});

// สร้าง model
const User = mongoose.model<IUser>('User', UserSchema);

export default User;