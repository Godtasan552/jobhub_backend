import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { IUser } from '@/types/index';

// สร้าง Mongoose Schema สำหรับ User
const UserSchema = new Schema<IUser>({
  // ข้อมูลชื่อผู้ใช้
  name: {
    type: String,
    required: [true, 'Name is required'], // ต้องกรอก
    trim: true, // ตัดช่องว่างหน้า/หลัง
    minlength: [2, 'Name must be at least 2 characters'], 
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  // ข้อมูลอีเมลผู้ใช้
  email: {
    type: String,
    required: [true, 'Email is required'], 
    unique: true, // ต้องไม่ซ้ำ
    lowercase: true, // เก็บเป็นตัวพิมพ์เล็ก
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'] // ตรวจสอบรูปแบบ
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
    default: 0, // ค่าเริ่มต้น
    min: [0, 'Wallet balance cannot be negative']
  },
  // ระบุบทบาทผู้ใช้
  role: {
    type: String,
    enum: ['employer', 'worker'], // จำกัดค่าที่เป็นไปได้
    required: [true, 'Role is required']
  },
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
  }
}, {
  timestamps: true, // สร้าง createdAt, updatedAt อัตโนมัติ
  versionKey: false // ปิด __v
});

// Indexes เพื่อเพิ่มประสิทธิภาพการค้นหา
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ skills: 1 });
UserSchema.index({ categories: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: -1 });

// Middleware ก่อน save: hash password
UserSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next(); // ถ้า password ไม่เปลี่ยน ไม่ hash ใหม่
  
  try {
    const saltRounds = 12;
    this.passwordHash = await bcrypt.hash(this.passwordHash, saltRounds); // hash password
    next();
  } catch (error) {
    next(error as Error);
  }
});

// ตรวจสอบ password ที่ผู้ใช้กรอก
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// อัปเดต last login
UserSchema.methods.updateLastLogin = async function(): Promise<void> {
  this.lastLoginAt = new Date();
  await this.save();
};

// เพิ่ม skill
UserSchema.methods.addSkill = function(skill: string): void {
  if (!this.skills.includes(skill)) {
    this.skills.push(skill);
  }
};

// ลบ skill
UserSchema.methods.removeSkill = function(skill: string): void {
  this.skills = this.skills.filter((s: string) => s !== skill);
};

// เพิ่ม category
UserSchema.methods.addCategory = function(category: string): void {
  if (!this.categories.includes(category)) {
    this.categories.push(category);
  }
};

// ลบ category
UserSchema.methods.removeCategory = function(category: string): void {
  this.categories = this.categories.filter((c: string) => c !== category);
};

// เพิ่มหรือลด wallet
UserSchema.methods.updateWallet = async function(amount: number, operation: 'add' | 'subtract' = 'add'): Promise<void> {
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

// Static method: ค้นหาผู้ใช้ด้วย email
UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method: ค้นหาผู้ใช้ที่ active
UserSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

// Static method: ค้นหาผู้ใช้ตาม role
UserSchema.statics.findByRole = function(role: 'employer' | 'worker') {
  return this.find({ role, isActive: true });
};

// Static method: ค้นหาผู้ใช้ตาม skills
UserSchema.statics.findBySkills = function(skills: string[]) {
  return this.find({ 
    skills: { $in: skills },
    role: 'worker',
    isActive: true 
  });
};

// Static method: ค้นหาผู้ใช้ตาม categories
UserSchema.statics.findByCategories = function(categories: string[]) {
  return this.find({ 
    categories: { $in: categories },
    role: 'worker',
    isActive: true 
  });
};

// Static method: สถิติผู้ใช้
UserSchema.statics.getUserStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        activeCount: {
          $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
        }
      }
    }
  ]);

  return {
    total: await this.countDocuments(),
    active: await this.countDocuments({ isActive: true }),
    employers: stats.find(s => s._id === 'employer')?.count || 0,
    workers: stats.find(s => s._id === 'worker')?.count || 0,
    activeEmployers: stats.find(s => s._id === 'employer')?.activeCount || 0,
    activeWorkers: stats.find(s => s._id === 'worker')?.activeCount || 0
  };
};

// Virtual: display name
UserSchema.virtual('displayName').get(function() {
  return this.name || this.email.split('@')[0];
});

// Virtual: คำนวณ profile completion %
UserSchema.virtual('profileCompletion').get(function() {
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

// Transform output สำหรับ JSON
UserSchema.set('toJSON', {
  transform: function(_doc, ret) { //เปลี่ยน doc เป็น _ แล้วโค้ดทำงานได้เหมือนเดิม และ TypeScript จะไม่เตือนแล้วครับ
    ret.id = ret._id; // เปลี่ยน _id เป็น id
    delete ret._id;
    delete ret.passwordHash; // ลบ password hash
    delete ret.__v; // ลบ __v
    return ret;
  }
});

// Transform output สำหรับ Object
UserSchema.set('toObject', {
  transform: function(_doc, ret) { //เปลี่ยน doc เป็น _ แล้วโค้ดทำงานได้เหมือนเดิม และ TypeScript จะไม่เตือนแล้วครับ
    ret.id = ret._id;
    delete ret._id;
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

// สร้าง model
const User = mongoose.model<IUser>('User', UserSchema);

// Export model เพื่อใช้ที่อื่น
export default User;
