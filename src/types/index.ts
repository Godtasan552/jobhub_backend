import { Document , Types} from 'mongoose';
import { Request } from 'express';

/* ==============================
   USER TYPES (ข้อมูลผู้ใช้งาน)
   ============================== */
export interface IUser extends Document {
  _id: string;                // รหัสผู้ใช้
  name: string;               // ชื่อ
  email: string;              // อีเมล
  passwordHash: string;       // รหัสผ่าน (เข้ารหัสแล้ว)
  wallet: number;             // กระเป๋าเงินในระบบ
  role: 'employer' | 'worker';// บทบาท: ผู้ว่าจ้าง / ฟรีแลนซ์
  skills: string[];           // ทักษะของผู้ใช้
  categories: string[];       // หมวดหมู่ที่ถนัด
  profilePic?: string;        // รูปโปรไฟล์
  about?: string;             // ข้อมูลแนะนำตัว
  phone?: string;             // เบอร์โทร
  location?: string;          // ที่อยู่ / จังหวัด
  isActive: boolean;          // สถานะใช้งาน
  lastLoginAt?: Date;         // เวลาล็อกอินล่าสุด
  createdAt: Date;            // วันที่สร้าง
  updatedAt: Date;            // วันที่อัปเดตล่าสุด
}

/* ==============================
   JOB TYPES (ข้อมูลงาน)
   ============================== */
export type JobType = 'freelance' | 'part-time' | 'contract' | 'full-time'; // ประเภทงาน
export type JobStatus = 'active' | 'closed' | 'in_progress' | 'completed' | 'cancelled'; // สถานะงาน

export interface IJob extends Document {
  _id: string;
  title: string;              // ชื่องาน
  description: string;        // รายละเอียดงาน
  type: JobType;              // ประเภทงาน
  category: string;           // หมวดหมู่
  budget: number;             // งบประมาณ
  duration: string;           // ระยะเวลาในการทำงาน
  deadline?: Date;            // วันสิ้นสุดรับงาน
  employerId: Types.ObjectId;         // ใครเป็นผู้ว่าจ้าง
  workerId?: string;          // ใครเป็นคนทำงาน (อาจยังไม่มี)
  status: JobStatus;          // สถานะของงาน
  requirements?: string[];    // เงื่อนไขการจ้าง
  attachments?: string[];     // ไฟล์แนบ
  applicants: string[];       // รายชื่อผู้สมัครงาน
  milestones?: string[];      // งานย่อย / milestone
  createdAt: Date;
  updatedAt: Date;
}

/* ==============================
   MILESTONE (งานย่อยใน Job)
   ============================== */
export type MilestoneStatus = 'unpaid' | 'in_progress' | 'completed' | 'paid';

export interface IMilestone extends Document {
  _id: string;
  jobId: string;              // อ้างอิงกลับไปที่งานหลัก
  title: string;
  description?: string;
  amount: number;             // เงินที่ต้องจ่าย milestone นี้
  dueDate?: Date;             // กำหนดส่ง
  status: MilestoneStatus;    // สถานะการทำงาน/การจ่าย
  completedAt?: Date;         // วันทำเสร็จ
  paidAt?: Date;              // วันจ่ายเงิน
  createdAt: Date;
  updatedAt: Date;
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
  from: string;               // ใครจ่าย
  to: string;                 // ใครรับ
  amount: number;             // จำนวนเงิน
  status: TransactionStatus;  // สถานะธุรกรรม
  description?: string;       // คำอธิบาย
  reference?: string;         // หมายเลขอ้างอิง
  createdAt: Date;
  updatedAt: Date;
}

/* ==============================
   MESSAGE (ข้อความ/แชท)
   ============================== */
export interface IMessage extends Document {
  _id: string;
  fromUserId: string;         // ผู้ส่ง
  toUserId: string;           // ผู้รับ
  jobId?: string;             // ผูกกับงาน (ถ้ามี)
  message: string;            // เนื้อความ
  messageType: 'text' | 'file' | 'image'; // ประเภทข้อความ
  attachment?: string;        // ไฟล์แนบ
  read: boolean;              // อ่านแล้วหรือยัง
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/* ==============================
   NOTIFICATION (การแจ้งเตือน)
   ============================== */
export type NotificationType = 'job' | 'milestone' | 'payment' | 'chat' | 'system';

export interface INotification extends Document {
  _id: string;
  userId: string;             // ใครเป็นผู้รับแจ้งเตือน
  type: NotificationType;     // ประเภทการแจ้งเตือน
  title: string;              // หัวข้อ
  message: string;            // เนื้อหา
  referenceId?: string;       // อ้างอิง object อื่น เช่น jobId
  referenceType?: 'job' | 'milestone' | 'transaction' | 'message';
  read: boolean;
  readAt?: Date;
  actionUrl?: string;         // ลิงก์กดไปดูรายละเอียด
  createdAt: Date;
  updatedAt: Date;
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
}

/* ==============================
   AUTH (การยืนยันตัวตน)
   ============================== */
export interface AuthRequest extends Request {
  user?: IUser;               // เก็บข้อมูล user หลังจากตรวจสอบ JWT
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;               // บทบาท (ใช้ตรวจสอบสิทธิ์)
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


