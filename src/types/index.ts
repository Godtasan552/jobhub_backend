import { Document , Types, Model} from 'mongoose';
import { Request } from 'express';

/* ==============================
   USER TYPES (ข้อมูลผู้ใช้งาน) - Updated for Multi-Role
   ============================== */
export interface IUser extends Document {
  _id: string;                // รหัสผู้ใช้
  name: string;               // ชื่อ
  email: string;              // อีเมล
  passwordHash: string;       // รหัสผ่าน (เข้ารหัสแล้ว)
  wallet: number;             // กระเป๋าเงินในระบบ
  role: ('employer' | 'worker' | 'admin')[]; // บทบาท: สามารถมีได้หลายบทบาท
  skills: string[];           // ทักษะของผู้ใช้
  categories: string[];       // หมวดหมู่ที่ถนัด
  profilePic?: string;        // รูปโปรไฟล์
  about?: string;             // ข้อมูลแนะนำตัว
  phone?: string;             // เบอร์โทร
  location?: string;          // ที่อยู่ / จังหวัด
  isActive: boolean;          // สถานะใช้งาน
  lastLoginAt?: Date;         // เวลาล็อกอินล่าสุด
  createdAt: Date;            // วันที่สร้าง
  updatedAt: Date;            // วันที่แก้ไขล่าสุด
  
  // Worker approval fields
  isWorkerApproved?: boolean;    // Admin อนุมัติ Worker แล้วหรือยัง
  workerApprovedAt?: Date;       // วันที่อนุมัติ Worker
  workerApprovedBy?: string;     // Admin คนไหนอนุมัติ
  workerRejectionReason?: string; // เหตุผลถ้าถูกปฏิเสธ
  workerApplicationDate?: Date;   // วันที่สมัครเป็น Worker
  
  // Admin fields
  adminLevel?: 'super' | 'moderator'| undefined; // ระดับ Admin
  createdBy?: string;            // ใครสร้าง (สำหรับ audit trail)
  lastAdminAction?: Date;        // การกระทำล่าสุดของ admin
  
  // Original methods
  comparePassword(password: string): Promise<boolean>;
  updateLastLogin(): Promise<void>;
  updateWallet(amount: number, operation: 'add' | 'subtract'): Promise<void>;
  getPublicProfile(): object;
  
  // New role management methods
  hasRole(roleType: 'employer' | 'worker' | 'admin'): boolean;
  isEmployer(): boolean;
  isWorker(): boolean;
  isAdmin(): boolean;
  isSuperAdmin(): boolean;
  addRole(roleType: 'employer' | 'worker' | 'admin'): void;
  removeRole(roleType: 'employer' | 'worker' | 'admin'): void;
  
  // Worker specific methods
  checkWorkerApproved(): boolean;
  canAcceptJobs(): boolean;
  canApplyForJobs(): boolean;
  
  // Admin specific methods
  canCreateAdmin(): boolean;
  canManageUsers(): boolean;
  canApproveWorkers(): boolean;
}

// Static methods interface for User
export interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>;
  findActiveUsers(): Promise<IUser[]>;
  findByRole(role: 'employer' | 'worker' | 'admin'): Promise<IUser[]>;
  findBySkills(skills: string[]): Promise<IUser[]>;
  findByCategories(categories: string[]): Promise<IUser[]>;
  findPendingWorkers(): Promise<IUser[]>;
  findApprovedWorkers(): Promise<IUser[]>;
  getUserStats(): Promise<any>;
}

/* ==============================
   JOB TYPES (ข้อมูลงาน) - Updated for role validation
   ============================== */
export type JobType = 'freelance' | 'part-time' | 'contract' | 'full-time';
export type JobStatus = 'active' | 'closed' | 'in_progress' | 'completed' | 'cancelled';

export interface IJob extends Document {
  _id: string;
  title: string;              // ชื่องาน
  description: string;        // รายละเอียดงาน
  type: JobType;              // ประเภทงาน
  category: string;           // หมวดหมู่
  budget: number;             // งบประมาณ
  duration: string;           // ระยะเวลาในการทำงาน
  deadline?: Date;            // วันสิ้นสุดรับงาน
  employerId: Types.ObjectId; // ใครเป็นผู้ว่าจ้าง
  workerId?: string;          // ใครเป็นคนทำงาน (อาจยังไม่มี)
  status: JobStatus;          // สถานะของงาน
  requirements?: string[];    // เงื่อนไขการจ้าง
  attachments?: string[];     // ไฟล์แนบ
  applicants: string[];       // รายชื่อผู้สมัครงาน
  milestones?: string[];      // งานย่อย / milestone
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  addApplicant(userId: string): boolean;
  removeApplicant(userId: string): boolean;
  assignWorker(workerId: string): Promise<void>;
  completeJob(): Promise<void>;
  cancelJob(): Promise<void>;
  closeJob(): Promise<void>;
  canUserApply(userId: string): boolean;
  isEditable(): boolean;
  addMilestone(milestoneId: string): void;
}

// Static methods interface for Job
export interface IJobModel extends Model<IJob> {
  findWithFilters(filters: any, options?: any): Promise<IJob[]>;
  searchJobs(searchTerm: string): Promise<IJob[]>;
  findByEmployer(employerId: string): Promise<IJob[]>;
  findByWorker(workerId: string): Promise<IJob[]>;
  findActiveJobs(): Promise<IJob[]>;
  findByCategory(category: string): Promise<IJob[]>;
  findByType(type: string): Promise<IJob[]>;
  getJobStats(): Promise<any>;
}

/* ==============================
   MILESTONE (งานย่อยใน Job)
   ============================== */
export type MilestoneStatus = 'unpaid' | 'in_progress' | 'completed' | 'paid';

export interface IMilestone extends Document {
  _id: string;
  jobId: Types.ObjectId;      // อ้างอิงกลับไปที่งานหลัก
  title: string;
  description?: string;
  amount: number;             // เงินที่ต้องจ่าย milestone นี้
  dueDate?: Date;             // กำหนดส่ง
  status: MilestoneStatus;    // สถานะการทำงาน/การจ่าย
  completedAt?: Date;         // วันทำเสร็จ
  paidAt?: Date;              // วันจ่ายเงิน
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  markCompleted(): Promise<void>;
  markPaid(): Promise<void>;
  canBePaid(): boolean;
}

/* ==============================
   PAYROLL (เงินเดือน)
   ============================== */
export type PayrollStatus = 'unpaid' | 'paid' | 'processing';

export interface IPayroll extends Document {
  _id: string;
  employerId: string;         // ผู้จ่ายเงิน
  employeeId: string;         // ผู้รับเงิน
  jobId?: string;             // ถ้าเป็นงานแบบรายเดือนอาจมี jobId อ้างอิง
  month: string;
  year: number;
  amount: number;             // จำนวนเงิน
  status: PayrollStatus;      // สถานะการจ่าย
  paidAt?: Date;              // วันจ่ายเงิน
  createdAt: Date;
  updatedAt: Date;
}

/* ==============================
   TRANSACTION (ธุรกรรมทางการเงิน)
   ============================== */
export type TransactionType = 'job_payment' | 'milestone_payment' | 'payroll' | 'refund' | 'bonus';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface ITransaction extends Document {
  _id: string;
  type: TransactionType;      // ประเภทธุรกรรม
  jobId?: string;             // ถ้าเกี่ยวข้องกับงาน
  milestoneId?: string;       // ถ้าเกี่ยวข้องกับ milestone
  payrollId?: string;         // ถ้าเกี่ยวข้องกับ payroll
  from: Types.ObjectId;       // ใครจ่าย
  to: Types.ObjectId;         // ใครรับ
  amount: number;             // จำนวนเงิน
  status: TransactionStatus;  // สถานะธุรกรรม
  description?: string;       // คำอธิบาย
  reference?: string;         // หมายเลขอ้างอิง
  createdAt: Date;
  updatedAt: Date;
  _direction?: string;
  direction?: string;
  // Instance methods
  generateReference(): string;
  complete(): Promise<void>;
  fail(reason: string): Promise<void>;
  cancel(reason?: string): Promise<void>;
}

/* ==============================
   MESSAGE (ข้อความ/แชท)
   ============================== */
export interface IMessage extends Document {
  _id: string;
  fromUserId: Types.ObjectId; // ผู้ส่ง
  toUserId: Types.ObjectId;   // ผู้รับ
  jobId?: string;             // ผูกกับงาน (ถ้ามี)
  message: string;            // เนื้อความ
  messageType: 'text' | 'file' | 'image'; // ประเภทข้อความ
  attachment?: string | null; // ไฟล์แนบ
  read: boolean;              // อ่านแล้วหรือยัง
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  _isFromMe?: boolean;
  // Instance methods
  markAsRead(): Promise<void>;
  isFromUser(userId: string): boolean;
  getChatRoomId(): string;
}

/* ==============================
   NOTIFICATION (การแจ้งเตือน)
   ============================== */
export type NotificationType = 'job' | 'milestone' | 'payment' | 'chat' | 'system' | 'worker_approval';

export interface INotification extends Document {
  _id: string;
  userId: Types.ObjectId;     // ใครเป็นผู้รับแจ้งเตือน
  type: NotificationType;     // ประเภทการแจ้งเตือน
  title: string;              // หัวข้อ
  message: string;            // เนื้อหา
  referenceId?: string;       // อ้างอิง object อื่น เช่น jobId
  referenceType?: 'job' | 'milestone' | 'transaction' | 'message' | 'worker_application';
  read: boolean;
  readAt?: Date | null;
  actionUrl?: string;         // ลิงก์กดไปดูรายละเอียด
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  markAsRead(): Promise<void>;
}

// Static methods interface for Notification
export interface INotificationModel extends Model<INotification> {
  createJobNotification(
    userId: string, 
    jobId: string, 
    title: string, 
    message: string, 
    actionUrl?: string
  ): Promise<INotification>;
  
  createMilestoneNotification(
    userId: string, 
    milestoneId: string, 
    title: string, 
    message: string, 
    actionUrl?: string
  ): Promise<INotification>;
  
  createPaymentNotification(
    userId: string, 
    transactionId: string, 
    title: string, 
    message: string, 
    actionUrl?: string | null 
  ): Promise<INotification>;
  
  createChatNotification(
    userId: string, 
    messageId: string, 
    title: string, 
    message: string, 
    actionUrl?: string
  ): Promise<INotification>;
  
  createSystemNotification(
    userId: string, 
    title: string, 
    message: string, 
    actionUrl?: string
  ): Promise<INotification>;
  
  createWorkerApprovalNotification(
    userId: string, 
    title: string, 
    message: string, 
    actionUrl?: string
  ): Promise<INotification>;
}

/* ==============================
   JOB APPLICATION (การสมัครงาน)
   ============================== */
export interface IJobApplication extends Document {
  _id: string;
  jobId: string;              // งานที่สมัคร
  workerId: string;           // คนสมัคร
  coverLetter: string;        // จดหมายแนะนำตัว
  proposedBudget?: number;    // เสนอราคา
  estimatedDuration?: string; // เสนอระยะเวลา
  attachments?: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  appliedAt: Date;            // วันสมัคร
  respondedAt?: Date;         // วันได้รับการตอบกลับ
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  accept(): Promise<void>;
  reject(reason?: string): Promise<void>;
  withdraw(): Promise<void>;
}

/* ==============================
   WORKER APPLICATION (การสมัครเป็น Worker)
   ============================== */
export interface IWorkerApplication extends Document {
  _id: string;
  userId: string;             // ผู้สมัคร
  skills: string[];           // ทักษะ
  categories: string[];       // หมวดหมู่
  experience: string;         // ประสบการณ์
  portfolio?: string;         // ผลงาน
  hourlyRate?: number;        // ราคาต่อชั่วโมง
  availability: 'full-time' | 'part-time' | 'flexible'; // ความพร้อม
  coverLetter?: string;       // จดหมายแนะนำตัว
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: Date;            // วันสมัคร
  reviewedAt?: Date;          // วันที่ admin review
  reviewedBy?: string;        // admin คนไหน review
  rejectionReason?: string;   // เหตุผลถ้าถูกปฏิเสธ
  createdAt: Date;
  updatedAt: Date;
}

/* ==============================
   AUTH (การยืนยันตัวตน) - Updated for multi-role
   ============================== */
export interface AuthRequest extends Request {
  user?: IUser;               // เก็บข้อมูล user หลังจากตรวจสอบ JWT
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: ('employer' | 'worker' | 'admin')[]; // เปลี่ยนเป็น array
  iat?: number;
  exp?: number;
}

/* ==============================
   API RESPONSE (มาตรฐานตอบกลับ API)
   ============================== */
export interface ApiResponse<T = any> {
  success: boolean;           // สำเร็จ/ล้มเหลว
  message: string;            // ข้อความ
  data?: T;                   // ข้อมูลหลักที่ส่งกลับ
  error?: string;             // ข้อผิดพลาด
  pagination?: {              // ข้อมูลแบ่งหน้า (ถ้ามี)
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta?: any;
}

/* ==============================
   QUERY PARAMETERS (พารามิเตอร์ query)
   ============================== */
export interface QueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  filter?: Record<string, any>;
}

/* ==============================
   SOCKET TYPES (แชทเรียลไทม์)
   ============================== */
export interface SocketUser {
  userId: string;
  socketId: string;
  isOnline: boolean;
}

export interface ChatRoom {
  roomId: string;
  participants: string[];     // รายชื่อผู้เข้าร่วม
  jobId?: string;             // ผูกกับงาน
}

/* ==============================
   FILE UPLOAD (ไฟล์ที่อัปโหลด)
   ============================== */
export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

/* ==============================
   VALIDATION ERROR (ข้อผิดพลาดเวลา validate)
   ============================== */
export interface ValidationError {
  field: string;              // ชื่อฟิลด์ที่ผิดพลาด
  message: string;            // ข้อความผิดพลาด
  value?: any;                // ค่าที่ส่งมา
}

/* ==============================
   STATISTICS (สถิติผู้ใช้และงาน)
   ============================== */
export interface UserStats {
  totalJobs: number;          // จำนวนงานทั้งหมด
  completedJobs: number;      // จำนวนงานที่เสร็จ
  totalEarnings: number;      // รายได้รวม
  averageRating: number;      // คะแนนเฉลี่ย
  responseTime: number;       // เวลาในการตอบกลับ
}

export interface JobStats {
  totalApplications: number;  // จำนวนการสมัครทั้งหมด
  averageBudget: number;      // งบประมาณเฉลี่ย
  completionRate: number;     // อัตราการทำสำเร็จ
  popularCategories: { category: string; count: number }[]; // หมวดหมู่ยอดนิยม
}

/* ==============================
   ADMIN DASHBOARD TYPES
   ============================== */
export interface AdminDashboardStats {
  users: {
    total: number;
    employers: number;
    workers: number;
    pendingWorkers: number;
    approvedWorkers: number;
    admins: number;
  };
  jobs: {
    total: number;
    active: number;
    completed: number;
    inProgress: number;
  };
  transactions: {
    total: number;
    totalAmount: number;
    pending: number;
    completed: number;
  };
  recentActivity: {
    newUsers: number;
    newJobs: number;
    completedJobs: number;
    pendingApprovals: number;
  };
}